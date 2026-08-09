import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutfit } from '../js/rules.js';
import { describeDay, pageTitle } from '../js/phrasing.js';

/** Heures plates par défaut ; chaque test creuse celles qui l'intéressent. */
function flatHours(feelsLike) {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    temp: feelsLike,
    feelsLike,
    precipitationMm: 0,
    precipitationProbability: 0,
    windGustsKmh: 10,
  }));
}

function calmDay(overrides = {}) {
  const feelsLikeMin = overrides.feelsLikeMin ?? 12;
  return {
    utcOffsetSeconds: 0,
    hours: flatHours(feelsLikeMin),
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

/** 8 h du matin le jour même : toute la journée est encore devant. */
const MATIN = new Date('2026-08-07T08:00:00Z');

function describe(overrides = {}, at = MATIN) {
  const weather = calmDay(overrides);
  return describeDay(weather, buildOutfit(weather), at);
}

/** Remplace une plage d'heures par des valeurs données. */
function withHours(weather, from, to, patch) {
  return {
    ...weather,
    hours: weather.hours.map((h) => (h.hour >= from && h.hour <= to ? { ...h, ...patch } : h)),
  };
}

/* ------------------------------------------------------------- la tenue */

test('la tenue est complète : rien n’est laissé à deviner', () => {
  // Le moteur décide un haut, un bas, une couche extérieure et des chaussures.
  // Taire la moitié — comme le faisait la version précédente — obligeait à
  // deviner comment s'habiller sur une page dont c'est la seule question.
  const weather = calmDay({ feelsLikeMin: 12, precipitationProbability: 80, precipitationMm: 6 });
  const outfit = buildOutfit(weather);
  const { wear } = describeDay(weather, outfit, MATIN);

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
  const { notes } = describeDay(weather, outfit, MATIN);

  assert.equal(notes.length, outfit.alerts.length);
});

test('les notes sont ordonnées par gravité décroissante', () => {
  const weather = calmDay({ feelsLikeMin: -3, feelsLikeMax: 12 });
  const { notes } = describeDay(weather, buildOutfit(weather), MATIN);

  assert.equal(notes.length, 2);
  assert.match(notes[0].text, /gèle|extrémités/i, 'le gel, en high, passe devant');
  assert.match(notes[1].text, /plus frais|ajuster/i);
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
  const partout = [ventFort.wear, ventFort.carry ?? '', ...ventFort.notes.map((n) => n.text)].join(' ');

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

/* -------------------------------------------------------- l’heure des notes */

test('la note de pluie dit quand il pleut', () => {
  const w = withHours(
    calmDay({ precipitationProbability: 80, precipitationMm: 6 }),
    16, 19, { precipitationProbability: 85, precipitationMm: 2 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const pluie = notes.find((n) => /pleuv|pluie/i.test(n.text));

  assert.equal(pluie.when, 'de 16 h à 19 h');
});

test('la note de vent dit quand il souffle', () => {
  const w = withHours(
    calmDay({ windGustsKmh: 55 }),
    14, 14, { windGustsKmh: 62 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const vent = notes.find((n) => /souffle|rafales/i.test(n.text));

  assert.equal(vent.when, 'vers 14 h');
});

test('la note de chaleur dit quand ça tape', () => {
  const w = withHours(
    calmDay({ feelsLikeMin: 22, feelsLikeMax: 34 }),
    15, 15, { feelsLike: 34 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const chaleur = notes.find((n) => /chaleur/i.test(n.text));

  assert.equal(chaleur.when, 'vers 15 h');
});

test('on ne date pas ce qui est déjà passé', () => {
  // Averse le matin, consultation l'après-midi : la plage retenue ne doit
  // porter que sur les heures qui restent.
  const w = withHours(
    calmDay({ precipitationProbability: 80, precipitationMm: 6 }),
    7, 20, { precipitationProbability: 85 },
  );
  const { notes } = describeDay(w, buildOutfit(w), new Date('2026-08-07T15:00:00Z'));
  const pluie = notes.find((n) => /pleuv|pluie/i.test(n.text));

  assert.equal(pluie.when, 'jusqu’à 20 h', 'la plage ne doit pas remonter avant maintenant');
});

test('sans données horaires, la note reste mais sans horaire', () => {
  const w = { ...calmDay({ precipitationProbability: 80, precipitationMm: 6 }), hours: [] };
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const pluie = notes.find((n) => /pleuv|pluie/i.test(n.text));

  assert.ok(pluie, 'la note doit survivre à l’absence d’heures');
  assert.equal(pluie.when, null);
});

test('une condition qui dure toute la fenêtre se dit ainsi', () => {
  const w = withHours(
    calmDay({ precipitationProbability: 90, precipitationMm: 10 }),
    0, 23, { precipitationProbability: 90 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const pluie = notes.find((n) => /pleuv|pluie/i.test(n.text));

  assert.equal(pluie.when, 'toute la journée');
});

test('l’amplitude ne reçoit pas d’horaire : elle en porte déjà deux', () => {
  const w = calmDay({ feelsLikeMin: 8, feelsLikeMax: 22 });
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const swing = notes.find((n) => /plus frais/i.test(n.text));

  assert.ok(swing);
  assert.equal(swing.when, null, 'elle porte déjà ses deux bornes');
});

test('une note est toujours une paire texte / horaire', () => {
  const w = withHours(
    calmDay({ feelsLikeMin: 2, feelsLikeMax: 16, precipitationProbability: 80, precipitationMm: 6 }),
    16, 19, { precipitationProbability: 85 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);

  assert.ok(notes.length > 0);
  for (const note of notes) {
    assert.equal(typeof note.text, 'string');
    assert.ok(note.text.trim().length > 0);
    assert.ok(note.when === null || typeof note.when === 'string');
  }
});

test('aucune accroche ne se dit « aujourd’hui »', () => {
  // La même phrase sert pour les deux jours, et le titre au-dessus dit déjà
  // lequel : « Ça va taper aujourd’hui » sous un titre DEMAIN se contredit.
  const temperatures = [-8, -2, 3, 7, 12, 17, 22, 27, 33];

  for (const t of temperatures) {
    for (const date of ['2026-01-05', '2026-03-19', '2026-06-14', '2026-09-02', '2026-11-23']) {
      const { weather } = describe({ date, feelsLikeMin: t, feelsLikeMax: t });
      assert.doesNotMatch(weather, /aujourd’hui|demain/i, `${t}°C le ${date} : ${weather}`);
    }
  }
});

/* ------------------------------------------- la plage, en heures brutes */

test('une note datée porte aussi sa plage en heures', () => {
  // La frise a besoin des heures elles-mêmes ; « de 16 h à 19 h » ne se
  // reconvertit pas en coordonnées sans réanalyser du texte.
  const w = withHours(
    calmDay({ precipitationProbability: 80, precipitationMm: 6 }),
    16, 19, { precipitationProbability: 85, precipitationMm: 2 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const pluie = notes.find((n) => /pleuv|pluie/i.test(n.text));

  assert.deepEqual(pluie.span, { from: 16, to: 19 });
  assert.equal(pluie.when, 'de 16 h à 19 h', 'les deux restent cohérents');
});

test('un instant se dit par une plage d’une seule heure', () => {
  const w = withHours(
    calmDay({ feelsLikeMin: 22, feelsLikeMax: 34 }),
    15, 15, { feelsLike: 34 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const chaleur = notes.find((n) => /chaleur/i.test(n.text));

  assert.deepEqual(chaleur.span, { from: 15, to: 15 });
});

test('sans horaire, il n’y a pas de plage non plus', () => {
  const w = calmDay({ feelsLikeMin: 8, feelsLikeMax: 22 });
  const { notes } = describeDay(w, buildOutfit(w), MATIN);
  const swing = notes.find((n) => /plus frais/i.test(n.text));

  assert.equal(swing.when, null);
  assert.equal(swing.span, null);
});

test('chaque note porte le libellé court de son alerte', () => {
  const w = withHours(
    calmDay({ precipitationProbability: 80, precipitationMm: 6, windGustsKmh: 50 }),
    16, 19, { precipitationProbability: 85, windGustsKmh: 55 },
  );
  const { notes } = describeDay(w, buildOutfit(w), MATIN);

  assert.ok(notes.some((n) => n.label === 'Pluie'));
  assert.ok(notes.some((n) => n.label === 'Vent'));
  for (const note of notes) assert.equal(typeof note.label, 'string');
});

/* ------------------------------------------ la confiance dans la prévision */

test('quand les modèles s’accordent, aucun avertissement', () => {
  assert.equal(describe({ feelsLikeMin: 12, feelsLikeMax: 12, feelsLikeSpread: 1 }).confidence, null);
});

test('sans désaccord mesuré, aucun avertissement non plus', () => {
  // Le repli mono-modèle : on ne prétend pas savoir ce qu'on n'a pas mesuré.
  assert.equal(describe({ feelsLikeMin: 15, feelsLikeMax: 15, feelsLikeSpread: null }).confidence, null);
});

test('quand le désaccord change la tenue, la page le dit', () => {
  // 15°C d'habillage est une frontière du barème ; 4°C d'écart place les
  // modèles de part et d'autre.
  const { confidence } = describe({ feelsLikeMin: 15, feelsLikeMax: 15, feelsLikeSpread: 4 });

  assert.ok(confidence, 'un avertissement est attendu');
  assert.match(confidence, /modèles/i);
  assert.match(confidence, /4\s*°C/, 'l’ampleur du désaccord doit être chiffrée');
  assert.doesNotMatch(confidence, /\d\.\d/, 'les décimales s’écrivent avec une virgule');
});

test('un gros désaccord loin d’une frontière ne dit rien', () => {
  // Même 4°C d'écart, mais en pleine canicule : la tenue ne bouge pas, donc
  // avertir ne servirait qu'à inquiéter.
  assert.equal(describe({ feelsLikeMin: 32, feelsLikeMax: 32, feelsLikeSpread: 4 }).confidence, null);
});

test('l’avertissement ne parle pas de vêtements précis', () => {
  // Il porte sur la fiabilité de la prévision, pas sur ce qu'on met : lister
  // des vêtements ici contredirait la tenue affichée juste au-dessus.
  const { confidence } = describe({ feelsLikeMin: 15, feelsLikeMax: 15, feelsLikeSpread: 4 });

  assert.doesNotMatch(confidence, /pull|jean|chemise|manteau/i);
});

test('le désaccord s’écrit avec une virgule décimale', () => {
  const { confidence } = describe({ feelsLikeMin: 15, feelsLikeMax: 15, feelsLikeSpread: 3.5 });

  assert.match(confidence, /3,5\s*°C/);
});


/* ------------------------------------------------------ le titre d'onglet */

const titre = (overrides, lieu) => pageTitle(buildOutfit(calmDay(overrides)), lieu);

test('le titre porte la réponse, pas la question', () => {
  // Un onglet fait quelques mots de large : « Qu'est-ce que je mets ? » y
  // occupe toute la place pour ne rien apprendre à qui a déjà ouvert la page.
  const t = titre({ feelsLikeMin: 2 }, 'Bergen, Vestland, Norvège');

  assert.match(t, /^[A-ZÉÈ]/, 'le titre commence par une majuscule');
  assert.match(t, /·/, 'les trois informations sont séparées');
  assert.match(t, /Bergen/);
});

test('le lieu perd sa région et son pays', () => {
  // « Bergen, Vestland, Norvège » mangerait le titre entier pour rien.
  assert.equal(titre({}, 'Paris, Île-de-France, France').endsWith('· Paris'), true);
});

test('sans lieu connu, le titre tient quand même', () => {
  const t = titre({ feelsLikeMin: 12 });

  assert.equal(t.includes('undefined'), false);
  assert.equal(t.includes('·'), true, 'la tenue et la température restent');
});

test('le titre montre la couche qui se voit', () => {
  // C'est le manteau qu'on remarque, pas le t-shirt qu'il recouvre.
  const froid = buildOutfit(calmDay({ feelsLikeMin: -2 }));

  assert.equal(pageTitle(froid, 'Oslo').startsWith(capitaliser(froid.layers.outer)), true);
});

const capitaliser = (mot) => mot.charAt(0).toUpperCase() + mot.slice(1);

test('la température affichée est celle pour laquelle on habille', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 12 }));

  assert.match(pageTitle(outfit, 'Lyon'), new RegExp(`${Math.round(outfit.dressedFor)}°`));
});
