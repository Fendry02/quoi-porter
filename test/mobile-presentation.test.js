import test from 'node:test';
import assert from 'node:assert/strict';

import { PALETTES } from '../js/sky.js';
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
  assert.equal(veilFor('#0b1a28', ['#e0e9ec']).color, '#ffffff');
});

test('un ciel qui porte déjà bien son encre ne reçoit presque pas de voile', () => {
  // Plein jour dégagé : encre sombre sur un horizon très clair. Le voile ne
  // doit pas venir laver un ciel qui allait très bien.
  const leger = veilFor('#0b1a28', ['#3d8ecf', '#e0e9ec']);
  const lourd = veilFor('#1b1630', ['#3b4a76', '#f0a878']);

  assert.ok(leger.alpha < lourd.alpha, `${leger.alpha} devrait être sous ${lourd.alpha}`);
});

test('chaque état de ciel du produit atteint la cible', () => {
  // La garantie que PRODUCT.md promet : « sufficient contrast in every weather
  // state ». On la vérifie sur les palettes de js/sky.js elles-mêmes : la copie
  // qui vivait ici a fini par décrire un ciel que le produit n'affichait plus.
  for (const [famille, moments] of Object.entries(PALETTES)) {
    for (const [moment, { zenith, horizon, ink }] of Object.entries(moments)) {
      const skies = [zenith, horizon];
      const veil = veilFor(ink, skies);

      for (const sky of skies) {
        const fond = blendOver(veil.color, veil.alpha, sky);
        assert.ok(
          contrastRatio(ink, fond) >= 4.5,
          `${famille} ${moment} sur ${sky} : ${contrastRatio(ink, fond).toFixed(2)}:1 avec un voile de ${veil.alpha}`,
        );
      }
    }
  }
});

test('le grand beau temps ne reçoit aucun voile', () => {
  // C'est le seul ciel qui en recevait un, et c'était le pire endroit possible :
  // un film blanc de 10 % posé sur la seule ambiance qui doit éclater. L'encre
  // a été assombrie jusqu'à rendre le voile inutile — ce test tient la garantie.
  const { zenith, horizon, ink } = PALETTES.clear.day;

  assert.equal(veilFor(ink, [zenith, horizon]).alpha, 0);
});
