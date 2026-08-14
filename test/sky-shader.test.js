/**
 * Le shader du ciel, compilé pour de vrai.
 *
 * Un shader qui ne compile pas échoue en silence : `SkyBackground` retombe sur
 * un aplat tiré de la même ambiance et l'écran reste parfaitement utilisable.
 * C'est le bon comportement en production et le pire possible en développement
 * — depuis un Mac on ne voit rien, et le ciel a simplement disparu sans qu'une
 * seule erreur soit remontée.
 *
 * CanvasKit et react-native-skia partagent le compilateur Skia. On compile donc
 * le SkSL ici, où l'échec est bruyant, plutôt que de l'apprendre sur l'appareil.
 *
 * Le test se saute de lui-même si les dépendances de l'app mobile ne sont pas
 * installées : le moteur météo doit rester testable sans elles.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const MOBILE = path.join(here, '..', 'apps', 'mobile');
const SHADER = path.join(MOBILE, 'src', 'sky', 'sky-shader.ts');
const BRIDGE = path.join(MOBILE, 'src', 'sky', 'use-sky-mood.ts');
const CANVASKIT_DIR = path.join(MOBILE, 'node_modules', 'canvaskit-wasm', 'bin');
const CANVASKIT = path.join(CANVASKIT_DIR, 'canvaskit.js');

/** Le SkSL, extrait du littéral de gabarit qui le porte. */
function shaderSource() {
  const source = fs.readFileSync(SHADER, 'utf8');
  const match = source.match(/export const SKY_SHADER = `([\s\S]*?)`;/);

  assert.ok(match, 'SKY_SHADER introuvable dans sky-shader.ts');
  return match[1];
}

/** Les uniformes que le shader déclare. */
function declaredUniforms(sksl) {
  return new Set([...sksl.matchAll(/^uniform\s+\S+\s+(u_\w+)\s*;/gm)].map((m) => m[1]));
}

/** Ceux que le pont envoie, tels qu'écrits dans l'objet rendu par le hook. */
function suppliedUniforms() {
  const source = fs.readFileSync(BRIDGE, 'utf8');
  return new Set([...source.matchAll(/^\s{6}(u_\w+):/gm)].map((m) => m[1]));
}

test('le pont envoie exactement les uniformes que le shader déclare', () => {
  const declares = declaredUniforms(shaderSource());
  const supplies = suppliedUniforms();

  assert.ok(declares.size > 0, 'aucun uniforme déclaré : la lecture a échoué');

  // Deux oublis symétriques, tous deux invisibles autrement : un uniforme
  // déclaré sans être alimenté vaut zéro et éteint l'effet sans rien dire ;
  // un uniforme envoyé sans être déclaré fait échouer tout le tirage.
  assert.deepEqual(
    [...declares].filter((u) => !supplies.has(u)),
    [],
    'déclarés par le shader, jamais envoyés',
  );
  assert.deepEqual(
    [...supplies].filter((u) => !declares.has(u)),
    [],
    'envoyés par le pont, jamais déclarés',
  );
});

test('le shader du ciel compile sous Skia', async (t) => {
  if (!fs.existsSync(CANVASKIT)) {
    t.skip('canvaskit-wasm absent — lancer npm install dans apps/mobile');
    return;
  }

  const CanvasKitInit = require(CANVASKIT);
  const CanvasKit = await CanvasKitInit({
    locateFile: (file) => path.join(CANVASKIT_DIR, file),
  });

  const errors = [];
  const effect = CanvasKit.RuntimeEffect.Make(shaderSource(), (e) => errors.push(e));

  assert.ok(effect, `le shader ne compile pas :\n${errors.join('\n')}`);

  // Le compilateur voit-il bien tous les uniformes ? Un nom mal orthographié
  // dans une déclaration passerait la comparaison textuelle des deux fichiers
  // mais pas celle-ci.
  assert.equal(effect.getUniformCount(), declaredUniforms(shaderSource()).size);

  effect.delete();
});
