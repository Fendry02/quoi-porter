/**
 * Envoi des captures d'écran vers App Store Connect.
 *
 * L'API demande trois temps pour chaque image : on réserve un emplacement, on
 * pousse les octets vers l'URL qu'elle renvoie, puis on confirme avec l'empreinte
 * du fichier. Sauter la confirmation laisse une capture fantôme, visible dans la
 * fiche mais jamais publiée — c'est le piège classique.
 *
 * Aucune dépendance : Node signe l'ES256 nativement, à condition de demander la
 * signature au format brut (`ieee-p1363`) et non le DER que renvoie OpenSSL.
 *
 * Usage :
 *   ASC_ISSUER_ID=... node scripts/upload-screenshots.mjs <dossier> [--replace]
 *
 * Variables d'environnement :
 *   ASC_ISSUER_ID  obligatoire, l'UUID visible en haut de la page des clés API
 *   ASC_KEY_ID     défaut C9Y9B2RFPK
 *   ASC_APP_ID     défaut 6801611537
 *   ASC_LOCALE     défaut fr-FR
 */

import { createHash, createSign } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com/v1';

/**
 * Le seul jeu de captures qu'Apple exige encore pour un iPhone.
 *
 * L'interface d'App Store Connect l'appelle « 6,9 pouces », mais la constante
 * de l'API est restée `APP_IPHONE_67` — il n'existe pas de `APP_IPHONE_69`,
 * l'API la refuse en 409. Le jeu 6,7 accepte les deux tailles, le 1290 × 2796
 * comme le 1320 × 2868 que sort l'iPhone 17 Pro Max.
 */
const DISPLAY_TYPE = 'APP_IPHONE_67';

/** Les états d'une version qu'on a encore le droit de modifier. */
const EDITABLE = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
]);

const KEY_ID = process.env.ASC_KEY_ID ?? 'C9Y9B2RFPK';
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const APP_ID = process.env.ASC_APP_ID ?? '6801611537';
const LOCALE = process.env.ASC_LOCALE ?? 'fr-FR';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * Un jeton valable vingt minutes. Apple refuse au-delà, et refuse aussi qu'on
 * réutilise un jeton expiré : on en fabrique un par exécution.
 */
async function tokenFor(now) {
  const keyPath = join(homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${KEY_ID}.p8`);
  const key = await readFile(keyPath, 'utf8');

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: ISSUER_ID,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 20 * 60,
      aud: 'appstoreconnect-v1',
    }),
  );

  const signer = createSign('SHA256');
  signer.update(`${header}.${payload}`);
  // Le format brut R||S : le DER par défaut produirait un jeton rejeté sans
  // explication utile.
  const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  return `${header}.${payload}.${signature}`;
}

async function api(token, method, path, body) {
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = parsed?.errors?.map((e) => `${e.title} — ${e.detail}`).join('\n  ') ?? text;
    throw new Error(`${method} ${path} → ${response.status}\n  ${detail}`);
  }

  return parsed;
}

/** La version en cours de préparation, celle qu'on peut encore remplir. */
async function editableVersion(token) {
  const { data } = await api(token, 'GET', `/apps/${APP_ID}/appStoreVersions?limit=20`);
  const version = data.find((v) =>
    EDITABLE.has(v.attributes.appStoreState ?? v.attributes.appVersionState),
  );

  if (!version) {
    const états = data.map((v) => v.attributes.appStoreState ?? v.attributes.appVersionState);
    throw new Error(
      `Aucune version modifiable sur l'app ${APP_ID}. États trouvés : ${états.join(', ') || 'aucun'}.\n` +
        "Crée une version dans App Store Connect, ou attends qu'un examen en cours se termine.",
    );
  }

  return version;
}

async function localizationFor(token, versionId) {
  const { data } = await api(
    token,
    'GET',
    `/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`,
  );

  const found = data.find((l) => l.attributes.locale === LOCALE);
  if (!found) {
    throw new Error(
      `La langue ${LOCALE} n'existe pas sur cette version. Langues présentes : ` +
        data.map((l) => l.attributes.locale).join(', '),
    );
  }

  return found;
}

async function screenshotSetFor(token, localizationId) {
  const { data } = await api(
    token,
    'GET',
    `/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=50`,
  );

  const existing = data.find((s) => s.attributes.screenshotDisplayType === DISPLAY_TYPE);
  if (existing) return existing;

  const created = await api(token, 'POST', '/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: DISPLAY_TYPE },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: 'appStoreVersionLocalizations', id: localizationId },
        },
      },
    },
  });

  return created.data;
}

/**
 * Réserve, pousse, confirme. Les trois temps sont enchaînés ici parce qu'une
 * capture réservée mais non confirmée reste en travers dans la fiche.
 */
async function upload(token, setId, file) {
  const bytes = await readFile(file);
  const name = basename(file);

  const reserved = await api(token, 'POST', '/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileSize: bytes.length, fileName: name },
      relationships: {
        appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } },
      },
    },
  });

  const { id, attributes } = reserved.data;

  for (const operation of attributes.uploadOperations) {
    const headers = Object.fromEntries(operation.requestHeaders.map((h) => [h.name, h.value]));
    const chunk = bytes.subarray(operation.offset, operation.offset + operation.length);

    const response = await fetch(operation.url, {
      method: operation.method,
      headers,
      body: chunk,
    });

    if (!response.ok) {
      throw new Error(`${name} : envoi refusé (${response.status} ${response.statusText})`);
    }
  }

  await api(token, 'PATCH', `/appScreenshots/${id}`, {
    data: {
      type: 'appScreenshots',
      id,
      attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') },
    },
  });

  return name;
}

async function clear(token, setId) {
  const { data } = await api(token, 'GET', `/appScreenshotSets/${setId}/appScreenshots?limit=50`);

  for (const shot of data) {
    await api(token, 'DELETE', `/appScreenshots/${shot.id}`);
    console.log(`  supprimée  ${shot.attributes.fileName}`);
  }

  return data.length;
}

async function main() {
  const [folder, ...flags] = process.argv.slice(2);

  if (!folder) throw new Error('Indique le dossier des captures.');
  if (!ISSUER_ID) {
    throw new Error(
      "ASC_ISSUER_ID manquant. C'est l'UUID affiché en haut de la page\n" +
        'App Store Connect > Utilisateurs et accès > Intégrations > Clés API.',
    );
  }

  const files = (await readdir(folder))
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()
    .map((f) => join(folder, f));

  if (files.length === 0) throw new Error(`Aucun PNG dans ${folder}.`);

  // L'ordre d'envoi est l'ordre d'affichage dans la fiche : on trie sur le nom,
  // d'où les préfixes numériques des fichiers.
  console.log(`${files.length} capture(s), dans cet ordre :`);
  for (const f of files) console.log(`  ${basename(f)}`);

  const token = await tokenFor(Date.now());

  const version = await editableVersion(token);
  console.log(
    `\nVersion ${version.attributes.versionString} (${version.attributes.appStoreState ?? version.attributes.appVersionState})`,
  );

  const localization = await localizationFor(token, version.id);
  const set = await screenshotSetFor(token, localization.id);
  console.log(`Jeu ${DISPLAY_TYPE} en ${LOCALE} : ${set.id}`);

  if (flags.includes('--replace')) {
    const removed = await clear(token, set.id);
    if (removed) console.log(`${removed} capture(s) retirée(s).`);
  }

  console.log('');
  for (const file of files) {
    console.log(`  envoi      ${await upload(token, set.id, file)}`);
  }

  console.log('\nTerminé. Vérifie le rendu dans la fiche avant de soumettre.');
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
