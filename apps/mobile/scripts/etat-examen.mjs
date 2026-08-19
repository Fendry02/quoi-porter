/**
 * Dit où en est l'examen App Review, sans ouvrir App Store Connect.
 *
 * Un refus « 2.1 — Information Needed » laisse le dossier ouvert : la version
 * reste `REJECTED` et la soumission `UNRESOLVED_ISSUES` jusqu'à ce qu'un
 * examinateur reprenne le fil. Rien dans l'interface ne prévient quand ça
 * arrive, d'où ce script : il compare l'état du jour à l'état bloqué connu et
 * tranche en une ligne.
 *
 * Le Centre de résolution, lui, n'a aucune ressource dans l'API — ni le fil, ni
 * le motif du refus. Ce script voit donc qu'Apple a repris la main, jamais ce
 * qu'Apple a écrit.
 *
 * Usage :
 *   ASC_ISSUER_ID=$(cat ~/.appstoreconnect/issuer-id) node scripts/etat-examen.mjs
 *
 * Sortie : 0 si rien n'a bougé, 10 si l'état a changé, 1 en cas d'erreur.
 */

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com/v1';

const KEY_ID = process.env.ASC_KEY_ID ?? 'C9Y9B2RFPK';
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const APP_ID = process.env.ASC_APP_ID ?? '6801611537';

/** L'état bloqué connu, constaté le 18 août 2026 sur le refus du 16. */
const BLOQUE = { version: 'REJECTED', soumission: 'UNRESOLVED_ISSUES' };

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

async function api(token, path) {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = parsed?.errors?.map((e) => `${e.title} — ${e.detail}`).join('\n  ') ?? text;
    throw new Error(`GET ${path} → ${response.status}\n  ${detail}`);
  }

  return parsed;
}

async function main() {
  if (!ISSUER_ID) throw new Error('ASC_ISSUER_ID manquant.');

  const token = await tokenFor(Date.now());

  const { data: versions } = await api(token, `/apps/${APP_ID}/appStoreVersions?limit=5`);
  const version = versions[0];
  if (!version) throw new Error('Aucune version sur cette app.');

  const etatVersion = version.attributes.appStoreState ?? version.attributes.appVersionState;
  console.log(`version ${version.attributes.versionString} — ${etatVersion}`);

  const { data: soumissions, included } = await api(
    token,
    `/reviewSubmissions?filter[app]=${APP_ID}&include=items&limit=10`,
  );

  // La plus récente d'abord : c'est celle qui porte le sort de la version.
  const soumission = soumissions[0];
  const etatSoumission = soumission?.attributes.state ?? '(aucune soumission)';

  for (const s of soumissions) {
    console.log(`soumission ${s.id} — ${s.attributes.state} — envoyée ${s.attributes.submittedDate}`);
  }
  for (const item of included ?? []) {
    console.log(`  item — ${item.attributes.state}`);
  }

  const bouge = etatVersion !== BLOQUE.version || etatSoumission !== BLOQUE.soumission;

  if (bouge) {
    console.log(`\nÉTAT: A BOUGÉ — version ${etatVersion}, soumission ${etatSoumission}`);
    console.log(`(état bloqué connu : ${BLOQUE.version} / ${BLOQUE.soumission})`);
    process.exitCode = 10;
    return;
  }

  console.log(`\nÉTAT: INCHANGÉ — toujours ${BLOQUE.version} / ${BLOQUE.soumission}, Apple n'a pas repris le fil.`);
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exitCode = 1;
});
