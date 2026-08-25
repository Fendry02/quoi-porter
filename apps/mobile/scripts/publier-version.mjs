/**
 * Prépare une version sur App Store Connect, et la soumet si on le demande.
 *
 * Monter un build ne publie rien : il faut une version qui le porte, une note
 * « Nouveautés », et une soumission. L'interface fait tout ça en dix clics
 * dispersés ; l'API le fait en une commande rejouable, ce qui permet de relire
 * ce qui part avant que ça parte.
 *
 * Le script est idempotent : il retrouve la version si elle existe déjà, et
 * n'écrit que ce qui manque.
 *
 * Usage :
 *   ASC_ISSUER_ID=$(cat ~/.appstoreconnect/issuer-id) \
 *     node scripts/publier-version.mjs 1.1.0 3 ../../docs/store/nouveautes-1.1.0.txt
 *
 * Ajouter `--soumettre` pour envoyer à l'examen. Sans ce drapeau, la version
 * reste préparée et supprimable, invisible du public.
 */

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.appstoreconnect.apple.com/v1';

const KEY_ID = process.env.ASC_KEY_ID ?? 'C9Y9B2RFPK';
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const APP_ID = process.env.ASC_APP_ID ?? '6801611537';

const MOBILE = dirname(dirname(fileURLToPath(import.meta.url)));

/** Le champ Nouveautés est limité comme les autres textes de la fiche. */
const MAX_NOUVEAUTES = 4000;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

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
  return `${header}.${payload}.${signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function api(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
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
    const erreur = new Error(`${method} ${path} → ${response.status}\n  ${detail}`);
    erreur.statut = response.status;
    throw erreur;
  }

  return parsed;
}

/** Un 404 est une réponse, pas une panne : la ressource n'existe pas encore. */
async function peutManquer(promesse) {
  return promesse.catch((error) => {
    if (error.statut === 404) return null;
    throw error;
  });
}

async function trouverOuCreerLaVersion(token, versionVoulue) {
  const { data: versions } = await api(token, 'GET', `/apps/${APP_ID}/appStoreVersions?limit=20`);

  const existante = versions.find((v) => v.attributes.versionString === versionVoulue);
  if (existante) {
    const état = existante.attributes.appStoreState ?? existante.attributes.appVersionState;
    console.log(`version ${versionVoulue} déjà là — ${état}`);
    return { version: existante, précédente: versions.find((v) => v.id !== existante.id) };
  }

  const { data: créée } = await api(token, 'POST', '/appStoreVersions', {
    data: {
      type: 'appStoreVersions',
      attributes: {
        platform: 'IOS',
        versionString: versionVoulue,
        // Comme la 1.0 : elle sort d'elle-même une fois l'examen passé.
        releaseType: 'AFTER_APPROVAL',
      },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });

  console.log(`version ${versionVoulue} créée — ${créée.attributes.appStoreState ?? créée.attributes.appVersionState}`);
  return { version: créée, précédente: versions[0] };
}

async function attacherLeBuild(token, version, numéro) {
  const { data: builds } = await api(
    token,
    'GET',
    `/builds?filter[app]=${APP_ID}&limit=10&sort=-uploadedDate`,
  );

  const build = builds.find((b) => b.attributes.version === numéro);
  if (!build) throw new Error(`Aucun build ${numéro} sur cette app.`);
  if (build.attributes.processingState !== 'VALID') {
    throw new Error(`Le build ${numéro} est ${build.attributes.processingState}, pas VALID.`);
  }

  await api(token, 'PATCH', `/appStoreVersions/${version.id}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  });

  console.log(`build ${numéro} attaché à la version ${version.attributes.versionString}`);
}

async function poserLesNouveautes(token, version, précédente, texte) {
  const { data: locales } = await api(
    token,
    'GET',
    `/appStoreVersions/${version.id}/appStoreVersionLocalizations`,
  );

  const fr = locales.find((l) => l.attributes.locale === 'fr-FR');

  if (fr) {
    await api(token, 'PATCH', `/appStoreVersionLocalizations/${fr.id}`, {
      data: { type: 'appStoreVersionLocalizations', id: fr.id, attributes: { whatsNew: texte } },
    });
    console.log(`nouveautés posées (${texte.length} caractères) sur la fiche fr-FR`);
    return;
  }

  // Fiche vierge : Apple n'a rien recopié, il faut reprendre le texte de la version d'avant.
  const { data: anciennes } = await api(
    token,
    'GET',
    `/appStoreVersions/${précédente.id}/appStoreVersionLocalizations`,
  );
  const ancienne = anciennes.find((l) => l.attributes.locale === 'fr-FR');
  if (!ancienne) throw new Error('Pas de fiche fr-FR à recopier sur la version précédente.');

  const { description, keywords, promotionalText, supportUrl, marketingUrl } = ancienne.attributes;

  await api(token, 'POST', '/appStoreVersionLocalizations', {
    data: {
      type: 'appStoreVersionLocalizations',
      attributes: {
        locale: 'fr-FR',
        description,
        keywords,
        promotionalText,
        supportUrl,
        marketingUrl,
        whatsNew: texte,
      },
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
    },
  });

  console.log(`fiche fr-FR recréée, nouveautés comprises (${texte.length} caractères)`);
}

async function reporterLesNotesDExamen(token, version, précédente) {
  const detail = await peutManquer(
    api(token, 'GET', `/appStoreVersions/${version.id}/appStoreReviewDetail`),
  );

  if (detail?.data?.attributes?.notes) {
    console.log(`notes d'examen déjà en place — ${detail.data.attributes.notes.length} caractères`);
    return;
  }

  const ancien = await peutManquer(
    api(token, 'GET', `/appStoreVersions/${précédente.id}/appStoreReviewDetail`),
  );
  if (!ancien?.data) {
    console.log("aucune fiche d'examen à reprendre sur la version précédente");
    return;
  }

  const a = ancien.data.attributes;
  const attributes = {
    contactFirstName: a.contactFirstName,
    contactLastName: a.contactLastName,
    contactPhone: a.contactPhone,
    contactEmail: a.contactEmail,
    demoAccountRequired: a.demoAccountRequired,
    notes: a.notes,
  };

  if (detail?.data) {
    await api(token, 'PATCH', `/appStoreReviewDetails/${detail.data.id}`, {
      data: { type: 'appStoreReviewDetails', id: detail.data.id, attributes },
    });
  } else {
    await api(token, 'POST', '/appStoreReviewDetails', {
      data: {
        type: 'appStoreReviewDetails',
        attributes,
        relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
      },
    });
  }

  console.log(`notes d'examen reprises de la version précédente — ${a.notes?.length ?? 0} caractères`);
}

async function soumettre(token, version) {
  const { data: soumissions } = await api(
    token,
    'GET',
    `/reviewSubmissions?filter[app]=${APP_ID}&limit=10`,
  );

  // Une soumission encore ouverte se réutilise ; une soumission envoyée se laisse tranquille.
  let soumission = soumissions.find((s) => s.attributes.state === 'READY_FOR_REVIEW');

  if (!soumission) {
    const { data: créée } = await api(token, 'POST', '/reviewSubmissions', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    });
    soumission = créée;
    console.log(`soumission ${soumission.id} ouverte`);
  } else {
    console.log(`soumission ${soumission.id} déjà ouverte, on la reprend`);
  }

  const { data: items } = await api(
    token,
    'GET',
    `/reviewSubmissions/${soumission.id}/items`,
  );

  if (!items.length) {
    await api(token, 'POST', '/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: soumission.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
        },
      },
    });
    console.log(`version ${version.attributes.versionString} ajoutée à la soumission`);
  } else {
    console.log(`${items.length} élément(s) déjà dans la soumission`);
  }

  const { data: envoyée } = await api(token, 'PATCH', `/reviewSubmissions/${soumission.id}`, {
    data: { type: 'reviewSubmissions', id: soumission.id, attributes: { submitted: true } },
  });

  console.log(`\nsoumission ${envoyée.id} — ${envoyée.attributes.state} — envoyée ${envoyée.attributes.submittedDate}`);
}

async function main() {
  if (!ISSUER_ID) throw new Error('ASC_ISSUER_ID manquant.');

  const [versionVoulue, numéroDeBuild, fichierNouveautes] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!versionVoulue || !numéroDeBuild || !fichierNouveautes) {
    throw new Error('Usage : publier-version.mjs <version> <build> <fichier-nouveautés> [--soumettre]');
  }

  const texte = (await readFile(resolve(MOBILE, fichierNouveautes), 'utf8')).trim();
  if (texte.length > MAX_NOUVEAUTES) {
    throw new Error(`Nouveautés trop longues : ${texte.length} caractères pour ${MAX_NOUVEAUTES} admis.`);
  }

  const token = await tokenFor(Date.now());

  const { version, précédente } = await trouverOuCreerLaVersion(token, versionVoulue);
  await attacherLeBuild(token, version, numéroDeBuild);
  await poserLesNouveautes(token, version, précédente, texte);
  await reporterLesNotesDExamen(token, version, précédente);

  if (!process.argv.includes('--soumettre')) {
    console.log('\nVersion prête, non soumise. Ajouter --soumettre pour l’envoyer à l’examen.');
    return;
  }

  await soumettre(token, version);
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exitCode = 1;
});
