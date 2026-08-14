import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blendOver,
  conditionLabel,
  contrastRatio,
  veilFor,
  weatherPalette,
} from '../js/mobile-presentation.js';

test('les codes météo deviennent des conditions lisibles dans l’app', () => {
  assert.equal(conditionLabel(1), 'Ciel dégagé');
  assert.equal(conditionLabel(63), 'Pluie');
  assert.equal(conditionLabel(73), 'Neige');
  assert.equal(conditionLabel(95), 'Orage');
});

test('la palette reste lisible lorsque le ciel s’assombrit', () => {
  const rain = weatherPalette(63, 'light');
  const storm = weatherPalette(95, 'dark');

  assert.equal(rain.ink, '#10242F');
  assert.equal(storm.ink, '#F3F7FA');
  assert.notEqual(rain.background, storm.background);
});

/* ------------------------------------------------------------- le contraste */

test('le rapport de contraste suit la définition WCAG', () => {
  // Les deux bornes connues : le noir sur blanc vaut 21, une couleur sur
  // elle-même vaut 1.
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio('#3b4a76', '#3b4a76') - 1) < 0.001);
});

test('le contraste ne dépend pas de l’ordre des deux couleurs', () => {
  const a = contrastRatio('#1b1630', '#f0a878');
  const b = contrastRatio('#f0a878', '#1b1630');

  assert.ok(Math.abs(a - b) < 1e-9);
});

test('poser un voile opaque efface la couleur du dessous', () => {
  assert.equal(blendOver('#ffffff', 1, '#3b4a76'), '#ffffff');
  assert.equal(blendOver('#ffffff', 0, '#3b4a76'), '#3b4a76');
});

test('le voile rend la tenue lisible sur le ciel qui la portait le moins bien', () => {
  // Le crépuscule clair, mesuré à l'écran à 2,4:1 sur le titre de la tenue :
  // une encre presque noire sur un zénith bleu sombre.
  const ink = '#1b1630';
  const skies = ['#3b4a76', '#f0a878'];

  const veil = veilFor(ink, skies);

  for (const sky of skies) {
    const fond = blendOver(veil.color, veil.alpha, sky);
    assert.ok(
      contrastRatio(ink, fond) >= 4.5,
      `${sky} voilé donne ${contrastRatio(ink, fond).toFixed(2)}:1`,
    );
  }
});

test('le voile garde aussi le texte secondaire au-dessus de 3:1', () => {
  // Le texte secondaire est l'encre à 69 % : il perd du contraste, et c'est
  // souvent lui qui décide de l'opacité du voile.
  const ink = '#1b1630';
  const skies = ['#3b4a76', '#f0a878'];

  const veil = veilFor(ink, skies);

  for (const sky of skies) {
    const fond = blendOver(veil.color, veil.alpha, sky);
    const secondaire = blendOver(ink, 0.69, fond);
    assert.ok(
      contrastRatio(secondaire, fond) >= 3,
      `${sky} voilé donne ${contrastRatio(secondaire, fond).toFixed(2)}:1 en secondaire`,
    );
  }
});

test('une encre claire appelle un voile sombre, une encre sombre un voile clair', () => {
  assert.equal(veilFor('#dde5f2', ['#0c1327']).color, '#060a14');
  assert.equal(veilFor('#12293d', ['#cfe4ef']).color, '#ffffff');
});

test('un ciel qui porte déjà bien son encre ne reçoit presque pas de voile', () => {
  // Plein jour dégagé : encre sombre sur un horizon très clair. Le voile ne
  // doit pas venir laver un ciel qui allait très bien.
  const leger = veilFor('#12293d', ['#4a90c4', '#cfe4ef']);
  const lourd = veilFor('#1b1630', ['#3b4a76', '#f0a878']);

  assert.ok(leger.alpha < lourd.alpha, `${leger.alpha} devrait être sous ${lourd.alpha}`);
});

test('chaque état de ciel du produit atteint la cible', () => {
  // La garantie que PRODUCT.md promet : « sufficient contrast in every weather
  // state ». On la vérifie sur les quinze palettes de js/sky.js.
  const palettes = [
    ['clear', '#4a90c4', '#cfe4ef', '#12293d'],
    ['clear dusk', '#3b4a76', '#f0a878', '#1b1630'],
    ['clear night', '#0c1327', '#28345a', '#dde5f2'],
    ['cloudy', '#7d9ab0', '#dfe6ea', '#1c262e'],
    ['cloudy dusk', '#4a4f6b', '#d99a7e', '#1d1a2c'],
    ['cloudy night', '#111823', '#2c3746', '#d9dee6'],
    ['overcast', '#8b959d', '#c8ced3', '#171d22'],
    ['overcast dusk', '#4f5158', '#9d8a86', '#1a1a1e'],
    ['overcast night', '#14181c', '#2a3138', '#d2d6da'],
    ['fog', '#b3b7b2', '#dcded9', '#22261f'],
    ['fog dusk', '#6e6a68', '#b5a49a', '#1e1c1a'],
    ['fog night', '#1a1d21', '#33383e', '#ccd0d2'],
    ['rain', '#2d3f4a', '#6b8089', '#f0f4f6'],
    ['rain dusk', '#22283c', '#6b5f6e', '#eceef4'],
    ['rain night', '#0d1119', '#212a35', '#dbe2e8'],
  ];

  for (const [nom, zenith, horizon, ink] of palettes) {
    const skies = [zenith, horizon];
    const veil = veilFor(ink, skies);

    for (const sky of skies) {
      const fond = blendOver(veil.color, veil.alpha, sky);
      assert.ok(
        contrastRatio(ink, fond) >= 4.5,
        `${nom} sur ${sky} : ${contrastRatio(ink, fond).toFixed(2)}:1 avec un voile de ${veil.alpha}`,
      );
    }
  }
});
