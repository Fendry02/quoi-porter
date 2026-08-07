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

test('la headline n’est jamais vide, quelle que soit la météo', () => {
  const cas = [
    { feelsLikeMin: 32, feelsLikeMax: 38, uvIndex: 9 },
    { feelsLikeMin: -8, weatherCode: 73 },
    { feelsLikeMin: 12, precipitationProbability: 90, precipitationMm: 12, windGustsKmh: 75 },
    { feelsLikeMin: 18 },
    { feelsLikeMin: 4, tempMin: 2, tempMax: 19 },
  ];

  for (const c of cas) {
    const { headline } = describe(c);
    assert.equal(typeof headline, 'string');
    assert.ok(headline.trim().length > 0, `headline vide pour ${JSON.stringify(c)}`);
  }
});

test('la headline mentionne les vêtements recommandés', () => {
  const { headline } = describe({ feelsLikeMin: 7 });

  assert.match(headline, /pull/i);
  assert.match(headline, /veste/i);
});

test('la headline mentionne la température ressentie', () => {
  const { headline } = describe({ feelsLikeMin: 6 });

  assert.match(headline, /6\s*°C/);
});

test('deux appels avec la même date donnent exactement la même sortie', () => {
  const a = describe({ feelsLikeMin: 9 });
  const b = describe({ feelsLikeMin: 9 });

  assert.deepEqual(a, b);
});

test('des dates différentes font varier la formulation', () => {
  const dates = [
    '2026-01-05', '2026-02-11', '2026-03-19', '2026-04-23',
    '2026-05-02', '2026-06-14', '2026-07-28', '2026-08-07',
  ];

  const headlines = new Set(
    dates.map((date) => describe({ date, feelsLikeMin: 9 }).headline),
  );

  assert.ok(
    headlines.size > 1,
    'le pool de variantes devrait produire plusieurs formulations selon la date',
  );
});

test('chaque alerte de l’Outfit produit une note', () => {
  const weather = calmDay({
    feelsLikeMin: 2,
    tempMin: 1,
    tempMax: 14,
    precipitationProbability: 80,
    precipitationMm: 6,
  });
  const outfit = buildOutfit(weather);
  const { notes } = describeDay(weather, outfit);

  assert.ok(outfit.alerts.length >= 2, 'ce cas doit générer plusieurs alertes');
  assert.equal(notes.length, outfit.alerts.length);
  for (const note of notes) {
    assert.ok(note.trim().length > 0);
  }
});

test('journée sans particularité : aucune note', () => {
  const { notes } = describe({ feelsLikeMin: 16 });

  assert.deepEqual(notes, []);
});

test('la note de pluie ne propose un parapluie que s’il est dans l’Outfit', () => {
  const avecParapluie = describe({ precipitationProbability: 80, precipitationMm: 6 });
  assert.ok(
    avecParapluie.notes.some((n) => /parapluie/i.test(n)),
    'le parapluie retenu doit être proposé',
  );

  // Rafales à 70 km/h : rules.js a retiré le parapluie. La note de pluie ne
  // doit donc pas le proposer, sinon on contredit l'alerte de vent.
  const ventFort = describe({
    precipitationProbability: 80,
    precipitationMm: 6,
    windGustsKmh: 70,
  });
  const notePluie = ventFort.notes.find((n) => /pleuv|pluie/i.test(n));

  assert.ok(notePluie, 'une note de pluie est attendue');
  assert.ok(
    !/prends un parapluie/i.test(notePluie),
    'ne pas proposer un parapluie que le vent vient d’écarter',
  );
});

test('journée à grosse amplitude : l’accroche ne minimise pas la chaleur à venir', () => {
  // 19°C au réveil, 33°C l'après-midi. Ouvrir sur « température agréable »
  // serait trompeur alors qu'une alerte canicule est levée.
  const { headline } = describe({ feelsLikeMin: 19, feelsLikeMax: 33, tempMin: 18, tempMax: 31 });

  assert.match(headline, /chaud|chaleur|taper|caniculaire/i);
});

test('les notes sont ordonnées par gravité décroissante', () => {
  const weather = calmDay({
    feelsLikeMin: 12,
    tempMin: 10,
    tempMax: 24,
    precipitationProbability: 45,
    precipitationMm: 1.5,
    windGustsKmh: 65,
  });
  const outfit = buildOutfit(weather);
  const { notes } = describeDay(weather, outfit);

  // Les alertes sortent de rules.js dans l'ordre pluie (medium), vent (high),
  // amplitude (medium). La note du vent doit remonter en tête.
  assert.deepEqual(
    outfit.alerts.map((a) => `${a.kind}:${a.severity}`),
    ['rain:medium', 'wind:high', 'swing:medium'],
  );

  assert.equal(notes.length, 3);
  assert.match(notes[0], /rafales|vent|souffle/i, 'la note la plus grave doit venir en premier');
});
