import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutfit } from '../js/rules.js';
import { describeDay } from '../js/phrasing.js';

function calmDay(overrides = {}) {
  const feelsLikeMin = overrides.feelsLikeMin ?? 12;
  return {
    date: '2026-08-07',
    tempMin: feelsLikeMin,
    tempMax: feelsLikeMin + 5,
    feelsLikeMin,
    feelsLikeMax: feelsLikeMin + 5,
    precipitationMm: 0,
    precipitationProbability: 0,
    windMaxKmh: 5,
    windGustsKmh: 10,
    uvIndex: 2,
    weatherCode: 1,
    ...overrides,
  };
}

function describe(overrides = {}) {
  const weather = calmDay(overrides);
  return describeDay(weather, buildOutfit(weather));
}

/* ------------------------------------------------------------- la tenue */

test('la tenue est complète : rien n’est laissé à deviner', () => {
  // Le moteur décide un haut, un bas, une couche extérieure et des chaussures.
  // Taire la moitié — comme le faisait la version précédente — obligeait à
  // deviner comment s'habiller sur une page dont c'est la seule question.
  const weather = calmDay({ feelsLikeMin: 12, precipitationProbability: 80, precipitationMm: 6 });
  const outfit = buildOutfit(weather);
  const { wear } = describeDay(weather, outfit);

  for (const piece of [...outfit.layers.top, outfit.layers.bottom, outfit.layers.outer, outfit.layers.feet]) {
    assert.match(wear.toLowerCase(), new RegExp(piece.toLowerCase()), `« ${piece} » manque`);
  }
});

test('la tenue se lit comme une énumération finie', () => {
  const { wear } = describe({ feelsLikeMin: 12, precipitationProbability: 80, precipitationMm: 6 });

  assert.match(wear, /^[A-ZÀ-Ý]/, 'la première pièce porte la majuscule');
  assert.match(wear, /\.$/, 'la phrase est close');
  assert.match(wear, / et /, 'la dernière pièce est reliée par « et »');
});

test('sans couche extérieure, la tenue n’en invente pas', () => {
  const { wear } = describe({ feelsLikeMin: 22 });

  assert.doesNotMatch(wear, /imperméable|manteau|veste|coupe-vent/i);
  assert.match(wear, /t-shirt/i);
  assert.match(wear, /pantalon/i);
});

test('les pièces sont énoncées de la tête aux pieds', () => {
  const { wear } = describe({ feelsLikeMin: 2, precipitationProbability: 80, precipitationMm: 6 });

  const rang = (mot) => wear.toLowerCase().indexOf(mot);
  assert.ok(rang('pull') < rang('jean'), 'le haut avant le bas');
  assert.ok(rang('jean') < rang('chaussures'), 'le bas avant les pieds');
});

/* --------------------------------------------------------- à emporter */

test('ce qu’on emporte est annoncé à part, avec ses articles', () => {
  const { carry } = describe({ precipitationProbability: 80, precipitationMm: 6 });

  // « Un parapluie. » — une phrase à part entière, pas un fragment de liste.
  assert.match(carry, /un parapluie/i);
  assert.match(carry, /^[A-ZÀ-Ý]/);
  assert.match(carry, /\.$/);
});

test('plusieurs choses à emporter sont reliées entre elles', () => {
  const { carry } = describe({ feelsLikeMin: -4, feelsLikeMax: 0 });

  assert.match(carry, /gants/);
  assert.match(carry, /bonnet/);
  assert.match(carry, / et /);
});

test('rien à emporter : le champ est nul plutôt que vide', () => {
  assert.equal(describe({ feelsLikeMin: 16, feelsLikeMax: 20 }).carry, null);
});

/* ------------------------------------------------------------ la météo */

test('la phrase météo est courte et ne parle plus de vêtements', () => {
  const { weather } = describe({ feelsLikeMin: 12, precipitationProbability: 80, precipitationMm: 6 });

  assert.match(weather, /°C ressentis/);
  assert.doesNotMatch(weather, /pull|jean|imperméable|parapluie/i);
  assert.equal(weather.match(/\./g).length, 1, `une seule phrase : ${weather}`);
});

test('la phrase météo annonce le ressenti pour lequel on a habillé', () => {
  const plat = describe({ feelsLikeMin: 6, feelsLikeMax: 6 });
  assert.match(plat.weather, /6\s*°C/);

  // Journée à amplitude : le point pondéré, pas le minimum.
  const ample = describe({ feelsLikeMin: 14, feelsLikeMax: 25 });
  assert.match(ample.weather, /18\s*°C/);
});

test('journée à grosse amplitude : l’accroche ne minimise pas la chaleur à venir', () => {
  const { weather } = describe({ feelsLikeMin: 19, feelsLikeMax: 33 });

  assert.match(weather, /chaud|chaleur|taper|caniculaire/i);
});

/* ------------------------------------------------------------ les notes */

test('chaque alerte produit une note : plus rien n’est promu ailleurs', () => {
  // La clause dans la phrase existait parce que la tenue était enterrée.
  // Maintenant qu'elle est en tête, elle ferait doublon avec le parapluie
  // déjà listé dans « à emporter ».
  const weather = calmDay({ feelsLikeMin: 2, feelsLikeMax: 16, precipitationProbability: 80, precipitationMm: 6 });
  const outfit = buildOutfit(weather);
  const { notes } = describeDay(weather, outfit);

  assert.equal(notes.length, outfit.alerts.length);
});

test('les notes sont ordonnées par gravité décroissante', () => {
  const weather = calmDay({ feelsLikeMin: -3, feelsLikeMax: 12 });
  const { notes } = describeDay(weather, buildOutfit(weather));

  assert.equal(notes.length, 2);
  assert.match(notes[0], /gèle|extrémités/i, 'le gel, en high, passe devant');
  assert.match(notes[1], /plus frais|ajuster/i);
});

test('journée sans particularité : aucune note', () => {
  assert.deepEqual(describe({ feelsLikeMin: 16, feelsLikeMax: 21 }).notes, []);
});

test('on ne propose jamais un parapluie que le vent vient d’écarter', () => {
  const ventFort = describe({
    precipitationProbability: 80,
    precipitationMm: 6,
    windGustsKmh: 70,
  });
  const partout = [ventFort.wear, ventFort.carry ?? '', ...ventFort.notes].join(' ');

  assert.doesNotMatch(partout, /prends un parapluie|et un parapluie/i);
  assert.match(partout, /pleuv|pluie/i, 'la pluie reste annoncée, elle');
});

/* ------------------------------------------------------ déterminisme */

test('deux appels avec la même date donnent exactement la même sortie', () => {
  assert.deepEqual(describe({ feelsLikeMin: 9 }), describe({ feelsLikeMin: 9 }));
});

test('des dates différentes font varier la formulation météo', () => {
  const dates = ['2026-01-05', '2026-03-19', '2026-06-14', '2026-09-02', '2026-11-23'];
  const phrases = new Set(dates.map((date) => describe({ date, feelsLikeMin: 9 }).weather));

  assert.ok(phrases.size > 1, 'le pool de variantes doit se voir');
});

test('la tenue, elle, ne varie pas avec la date', () => {
  // Les vêtements sont un fait, pas une tournure : ils doivent être identiques
  // d'un jour à l'autre à météo égale.
  const a = describe({ date: '2026-01-05', feelsLikeMin: 9 });
  const b = describe({ date: '2026-06-14', feelsLikeMin: 9 });

  assert.equal(a.wear, b.wear);
});

test('aucun champ n’est vide, quelle que soit la météo', () => {
  const cas = [
    { feelsLikeMin: 32, feelsLikeMax: 38, uvIndex: 9 },
    { feelsLikeMin: -8, weatherCode: 73, precipitationProbability: 90, precipitationMm: 8 },
    { feelsLikeMin: 12, precipitationProbability: 90, precipitationMm: 12, windGustsKmh: 75 },
    { feelsLikeMin: 18 },
  ];

  for (const c of cas) {
    const { wear, weather } = describe(c);
    assert.ok(wear.trim().length > 0, `tenue vide pour ${JSON.stringify(c)}`);
    assert.ok(weather.trim().length > 0, `météo vide pour ${JSON.stringify(c)}`);
  }
});
