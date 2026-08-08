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

test('la headline annonce le ressenti pour lequel on a habillé', () => {
  // Journée plate : le point d'habillage vaut le ressenti lui-même.
  const plat = describe({ feelsLikeMin: 6, feelsLikeMax: 6 });
  assert.match(plat.headline, /6\s*°C/);

  // Journée à amplitude : c'est le point pondéré (14 + 0,4 × 11 = 18,4) qui
  // est annoncé, pas le minimum — sinon la phrase contredirait la tenue.
  const ample = describe({ feelsLikeMin: 14, feelsLikeMax: 25 });
  assert.match(ample.headline, /18\s*°C/);
  assert.doesNotMatch(ample.headline, /14\s*°C/);
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

test('chaque alerte non promue produit une note', () => {
  const weather = calmDay({
    feelsLikeMin: 2,
    feelsLikeMax: 16,
    precipitationProbability: 80,
    precipitationMm: 6,
  });
  const outfit = buildOutfit(weather);
  const { notes } = describeDay(weather, outfit);

  assert.ok(outfit.alerts.length >= 2, 'ce cas doit générer plusieurs alertes');
  // Une seule alerte remonte dans la phrase ; toutes les autres restent en note.
  assert.equal(notes.length, outfit.alerts.length - 1);
  for (const note of notes) {
    assert.ok(note.trim().length > 0);
  }
});

test('journée sans particularité : aucune note', () => {
  const { notes } = describe({ feelsLikeMin: 16, feelsLikeMax: 21 });

  assert.deepEqual(notes, []);
});

test('on ne propose jamais un parapluie que le vent vient d’écarter', () => {
  const avecParapluie = describe({ precipitationProbability: 80, precipitationMm: 6 });
  assert.match(avecParapluie.headline, /parapluie/i, 'le parapluie retenu doit être proposé');

  // Rafales à 70 km/h : rules.js a retiré le parapluie, et c'est le vent qui
  // est promu. Nulle part on ne doit conseiller d'en prendre un.
  const ventFort = describe({
    precipitationProbability: 80,
    precipitationMm: 6,
    windGustsKmh: 70,
  });
  const partout = [ventFort.headline, ...ventFort.notes].join(' ');

  assert.doesNotMatch(partout, /prends (un|quand même un) parapluie/i);
  assert.match(partout, /pleuv|pluie/i, 'la pluie reste annoncée, elle');
});

test('journée à grosse amplitude : l’accroche ne minimise pas la chaleur à venir', () => {
  // 19°C au réveil, 33°C l'après-midi. Ouvrir sur « température agréable »
  // serait trompeur alors qu'une alerte canicule est levée.
  const { headline } = describe({ feelsLikeMin: 19, feelsLikeMax: 33 });

  assert.match(headline, /chaud|chaleur|taper|caniculaire/i);
});

test('les notes sont ordonnées par gravité décroissante', () => {
  const weather = calmDay({
    feelsLikeMin: 12,
    feelsLikeMax: 26,
    precipitationProbability: 45,
    precipitationMm: 1.5,
    windGustsKmh: 65,
  });
  const outfit = buildOutfit(weather);
  const { headline, notes } = describeDay(weather, outfit);

  // Les alertes sortent de rules.js dans l'ordre pluie (medium), vent (high),
  // amplitude (medium). Le vent, le plus grave, est promu dans la phrase ;
  // les deux autres restent en note.
  assert.deepEqual(
    outfit.alerts.map((a) => `${a.kind}:${a.severity}`),
    ['rain:medium', 'wind:high', 'swing:medium'],
  );

  assert.match(headline, /souffle|rafales|capuche/i, 'le plus grave monte dans la phrase');
  assert.equal(notes.length, 2);
  assert.ok(!notes.some((n) => /rafales|souffle/i.test(n)), 'et quitte les notes');
});

test('à gravité inégale, la note la plus grave vient en premier', () => {
  const weather = calmDay({
    feelsLikeMin: -3,       // alerte cold, gravité high
    feelsLikeMax: 12,       // alerte swing, gravité medium
  });
  const { notes } = describeDay(weather, buildOutfit(weather));

  assert.equal(notes.length, 2);
  assert.match(notes[0], /gèle|extrémités/i);
  assert.match(notes[1], /plus frais|ajuster/i);
});

/* --------------------------------------------- la clause de la headline */

function alertKinds(outfit) {
  return outfit.alerts.map((a) => a.kind);
}

test('la pluie retenue passe dans la phrase principale', () => {
  // Ce qu'on emporte change : ça mérite mieux qu'une note en dessous.
  const { headline } = describe({
    feelsLikeMin: 24, feelsLikeMax: 35,
    precipitationProbability: 80, precipitationMm: 6,
  });

  assert.match(headline, /parapluie/i);
});

test('l’alerte promue disparaît des notes', () => {
  const weather = calmDay({
    feelsLikeMin: 24, feelsLikeMax: 35,
    precipitationProbability: 80, precipitationMm: 6,
  });
  const outfit = buildOutfit(weather);
  const { headline, notes } = describeDay(weather, outfit);

  assert.match(headline, /parapluie/i);
  assert.ok(alertKinds(outfit).includes('rain'), 'l’alerte pluie existe bien');
  assert.ok(
    !notes.some((n) => /pleuv|pluie|parapluie/i.test(n)),
    'la pluie ne doit pas être répétée en note',
  );
  assert.equal(notes.length, outfit.alerts.length - 1);
});

test('le verglas passe avant tout le reste', () => {
  const { headline } = describe({
    feelsLikeMin: -1, feelsLikeMax: 2, weatherCode: 73,
    precipitationProbability: 90, precipitationMm: 8, windGustsKmh: 50,
  });

  assert.match(headline, /accroch|glisse|semelle|verglas/i);
});

test('le vent passe avant la pluie, sinon on proposerait un parapluie inutile', () => {
  const { headline, notes } = describe({
    feelsLikeMin: 4, feelsLikeMax: 9,
    precipitationProbability: 90, precipitationMm: 9, windGustsKmh: 85,
  });

  assert.match(headline, /capuche|souffle|rafales|vent/i);
  assert.doesNotMatch(headline, /prends un parapluie/i);
  assert.ok(!notes.some((n) => /rafales/i.test(n)), 'le vent promu quitte les notes');
});

test('le gel et la canicule ne donnent pas de clause : l’accroche le dit déjà', () => {
  const gel = describe({ feelsLikeMin: -6, feelsLikeMax: -2, weatherCode: 0 });
  const canicule = describe({ feelsLikeMin: 28, feelsLikeMax: 36, weatherCode: 0, uvIndex: 2 });

  // Une seule phrase, terminée par le point de la liste de vêtements.
  assert.equal(gel.headline.match(/\./g).length, 1, gel.headline);
  assert.equal(canicule.headline.match(/\./g).length, 1, canicule.headline);
});

test('l’amplitude reste une note, ce n’est pas quelque chose qu’on emporte', () => {
  const weather = calmDay({ feelsLikeMin: 10, feelsLikeMax: 24 });
  const outfit = buildOutfit(weather);
  const { headline, notes } = describeDay(weather, outfit);

  assert.doesNotMatch(headline, /plus frais|ajuster/i);
  assert.ok(notes.some((n) => /plus frais/i.test(n)));
});

test('sans rien à emporter, la phrase reste courte', () => {
  const { headline } = describe({ feelsLikeMin: 16, feelsLikeMax: 20 });

  assert.equal(headline.match(/\./g).length, 1);
});

test('une seule clause, même quand plusieurs alertes qualifient', () => {
  const weather = calmDay({
    feelsLikeMin: 3, feelsLikeMax: 8,
    precipitationProbability: 90, precipitationMm: 9,
    windGustsKmh: 45, uvIndex: 8,
  });
  const outfit = buildOutfit(weather);
  const { notes } = describeDay(weather, outfit);

  // Exactement une alerte a été promue, pas deux.
  assert.equal(notes.length, outfit.alerts.length - 1);
});

test('la clause est déterministe et varie selon la date', () => {
  const params = { feelsLikeMin: 12, feelsLikeMax: 17, precipitationProbability: 80, precipitationMm: 6 };

  assert.equal(describe(params).headline, describe(params).headline);

  // On isole la clause : sans ça, la variation de l'accroche suffirait à faire
  // passer le test sans rien prouver sur la clause elle-même.
  const clauseSeule = (h) => h.split('. ').slice(1).join('. ');
  const dates = ['2026-01-05', '2026-03-19', '2026-06-14', '2026-09-02', '2026-11-23'];
  const clauses = new Set(dates.map((date) => clauseSeule(describe({ ...params, date }).headline)));

  assert.ok(clauses.size > 1, `une seule formulation de clause : ${[...clauses]}`);
});
