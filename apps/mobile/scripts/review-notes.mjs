/**
 * Lit — et remplit — les « Informations pour l'examen de l'app » d'une version.
 *
 * Le champ Notes de l'interface est l'attribut `notes` de la ressource
 * `appStoreReviewDetail`, accrochée à la version. Passer par l'API évite de le
 * chercher dans la page, et rend l'opération rejouable.
 *
 * Usage :
 *   ASC_ISSUER_ID=$(cat ~/.appstoreconnect/issuer-id) node scripts/review-notes.mjs
 *   ASC_ISSUER_ID=... node scripts/review-notes.mjs --write <fichier.txt>
 *
 * Sans `--write`, le script se contente de montrer ce qui est en place.
 */

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com/v1';

const KEY_ID = process.env.ASC_KEY_ID ?? 'C9Y9B2RFPK';
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const APP_ID = process.env.ASC_APP_ID ?? '6801611537';

/** Le champ Notes accepte 4000 caractères, pas un de plus. */
const MAX_NOTES = 4000;

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

async function main() {
  if (!ISSUER_ID) throw new Error('ASC_ISSUER_ID manquant.');

  const write = process.argv.includes('--write');
  const source = write ? process.argv[process.argv.indexOf('--write') + 1] : null;
  if (write && !source) throw new Error('--write attend un chemin de fichier.');

  const token = await tokenFor(Date.now());

  const { data: versions } = await api(token, 'GET', `/apps/${APP_ID}/appStoreVersions?limit=20`);
  for (const v of versions) {
    const state = v.attributes.appStoreState ?? v.attributes.appVersionState;
    console.log(`version ${v.attributes.versionString} — ${state} — ${v.id}`);
  }

  const version = versions[0];
  if (!version) throw new Error('Aucune version sur cette app.');

  const detail = await api(
    token,
    'GET',
    `/appStoreVersions/${version.id}/appStoreReviewDetail`,
  ).catch((error) => {
    // Une version sans fiche d'examen renvoie 404 : il faut la creer.
    if (String(error).includes('404')) return null;
    throw error;
  });

  const a = detail?.data?.attributes ?? {};
  console.log('\n--- informations pour l’examen ---');
  console.log('contact       :', [a.contactFirstName, a.contactLastName].filter(Boolean).join(' ') || '(vide)');
  console.log('téléphone     :', a.contactPhone || '(vide)');
  console.log('e-mail        :', a.contactEmail || '(vide)');
  console.log('compte démo   :', a.demoAccountRequired ? 'exigé' : 'non exigé');
  console.log('notes         :', a.notes ? `${a.notes.length} caractères` : '(vide)');
  if (a.notes) console.log('\n' + a.notes);

  if (!write) return;

  const notes = (await readFile(source, 'utf8')).trim();
  if (notes.length > MAX_NOTES) {
    throw new Error(`Notes trop longues : ${notes.length} caractères pour ${MAX_NOTES} admis.`);
  }

  if (detail?.data) {
    await api(token, 'PATCH', `/appStoreReviewDetails/${detail.data.id}`, {
      data: { type: 'appStoreReviewDetails', id: detail.data.id, attributes: { notes } },
    });
    console.log(`\nnotes remplacées (${notes.length} caractères) sur la version ${version.attributes.versionString}.`);
  } else {
    await api(token, 'POST', '/appStoreReviewDetails', {
      data: {
        type: 'appStoreReviewDetails',
        attributes: { notes },
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
        },
      },
    });
    console.log(`\nfiche d’examen créée avec ${notes.length} caractères de notes.`);
  }
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exitCode = 1;
});
