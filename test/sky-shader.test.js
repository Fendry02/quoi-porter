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

test('aucun accent grave ne traîne dans le SkSL', () => {
  // Le shader vit dans un littéral de gabarit : un accent grave dans un
  // commentaire — écrire `sunLit` pour désigner l'uniforme — referme la chaîne
  // au milieu du programme. TypeScript le voit, mais pas ce fichier : la
  // lecture par expression régulière, elle, s'en accommode très bien et compile
  // un shader que l'app ne pourra jamais charger.
  assert.equal(shaderSource().includes('`'), false, 'accent grave dans le SkSL');
});

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

const SIZE = 256;

/**
 * Les uniformes, dans l'ordre où le shader les déclare — c'est l'ordre qu'attend
 * `makeShader`, qui ne reçoit qu'un tableau de flottants sans les noms.
 *
 * Un ciel de plein midi sous une couche épaisse, l'astre haut : le cas où les
 * rayons se voient le plus. Seule la pluie change d'un tirage à l'autre.
 */
function uniforms(precipIntensity) {
  return [
    SIZE, SIZE,        // u_resolution
    0,                 // u_time
    0.18, 0.25, 0.29,  // u_zenith
    0.42, 0.50, 0.54,  // u_horizon
    1,                 // u_sunHeight
    0.28,              // u_sunIntensity
    0,                 // u_starDensity
    0.85,              // u_cloudCover
    0.4,               // u_cloudSpeed
    0.5,               // u_turbulence
    0.38,              // u_haze
    precipIntensity,   // u_precipIntensity
    0,                 // u_precipIsSnow
    0,                 // u_flash
    0.3,               // u_wind
    0.5,               // u_heat
    0.1,               // u_moonPhase
    0,                 // u_scroll
    0,                 // u_dawn
  ];
}

/** Luminance perçue de chaque pixel du tirage. */
function render(CanvasKit, effect, precipIntensity) {
  const surface = CanvasKit.MakeSurface(SIZE, SIZE);
  const paint = new CanvasKit.Paint();
  const shader = effect.makeShader(uniforms(precipIntensity));

  paint.setShader(shader);
  surface.getCanvas().drawPaint(paint);

  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: SIZE,
    height: SIZE,
    colorType: CanvasKit.ColorType.RGBA_8888,
    alphaType: CanvasKit.AlphaType.Unpremul,
    colorSpace: CanvasKit.ColorSpace.SRGB,
  });

  const luma = new Float64Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const o = i * 4;
    luma[i] = (0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]) / 255;
  }

  shader.delete();
  paint.delete();
  surface.delete();
  return luma;
}

/** Le plus grand écart de luminance entre deux tirages de même taille. */
function ecartMax(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

/**
 * Le soleil ne perce pas l'averse.
 *
 * Mesurer les rayons dans l'image finie s'est révélé impossible à faire
 * honnêtement : le halo de l'astre et les nuages éclairés pèsent, dans la
 * région où les rayons vivent, bien plus lourd qu'eux. Une mesure qui les
 * englobe ne bouge presque pas quand les rayons disparaissent, et ne prouve
 * donc rien.
 *
 * On compare donc le shader à lui-même privé de son garde-fou. C'est la seule
 * différence entre les deux sources, donc tout écart entre les deux images lui
 * est imputable — et l'absence d'écart aussi.
 */
test('le soleil ne lance pas de rayons à travers la pluie qui tombe', async (t) => {
  if (!fs.existsSync(CANVASKIT)) {
    t.skip('canvaskit-wasm absent — lancer npm install dans apps/mobile');
    return;
  }

  const CanvasKitInit = require(CANVASKIT);
  const CanvasKit = await CanvasKitInit({
    locateFile: (file) => path.join(CANVASKIT_DIR, file),
  });

  const source = shaderSource();
  const sansGardeFou = source.replace('(1.0 - u_precipIntensity)', '1.0');

  assert.notEqual(
    sansGardeFou,
    source,
    'le garde-fou `(1.0 - u_precipIntensity)` a disparu du calcul des rayons',
  );

  const avec = CanvasKit.RuntimeEffect.Make(source, () => {});
  const sans = CanvasKit.RuntimeEffect.Make(sansGardeFou, () => {});
  assert.ok(avec && sans, 'le shader ne compile pas');

  // Par temps sec, le garde-fou vaut 1 : il ne doit rien coûter du tout. Un
  // ciel dégagé rendu autrement serait une régression silencieuse sur l'image
  // que voit la plupart des gens.
  assert.equal(
    ecartMax(render(CanvasKit, avec, 0), render(CanvasKit, sans, 0)),
    0,
    'le garde-fou modifie un ciel sec, où il ne devrait rien faire',
  );

  // Sous l'averse, il doit au contraire se voir franchement.
  const sousLAverse = ecartMax(render(CanvasKit, avec, 1), render(CanvasKit, sans, 1));
  assert.ok(
    sousLAverse > 0.05,
    `le garde-fou n'éteint pas les rayons sous l'averse : écart ${sousLAverse.toFixed(4)}`,
  );

  avec.delete();
  sans.delete();
});
