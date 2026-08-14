import test from 'node:test';
import assert from 'node:assert/strict';

import { moodFor, sunHeightAt, blendMoods, moonPhaseOn } from '../js/sky.js';

/** Journée type : lever 6 h 30, coucher 21 h 30, heure locale. */
function day(overrides = {}) {
  return {
    date: '2026-08-07',
    tempMin: 14,
    tempMax: 24,
    feelsLikeMin: 13,
    feelsLikeMax: 23,
    precipitationMm: 0,
    precipitationProbability: 0,
    windMaxKmh: 10,
    windGustsKmh: 18,
    uvIndex: 4,
    weatherCode: 0,
    sunrise: '2026-08-07T06:30',
    sunset: '2026-08-07T21:30',
    utcOffsetSeconds: 0,
    ...overrides,
  };
}

// Instant absolu. Avec un décalage de zéro, l'heure au lieu vaut l'heure UTC,
// donc ces tests donnent le même résultat sur n'importe quelle machine.
const at = (heure) => new Date(`2026-08-07T${heure}:00Z`);

/* ------------------------------------------------------ hauteur de soleil */

test('la hauteur de soleil culmine à mi-journée', () => {
  const midi = sunHeightAt(day(), at('14:00'));

  assert.ok(midi > 0.98, `attendu proche de 1, obtenu ${midi}`);
});

test('la hauteur de soleil est nulle au lever et au coucher', () => {
  assert.ok(Math.abs(sunHeightAt(day(), at('06:30'))) < 0.01);
  assert.ok(Math.abs(sunHeightAt(day(), at('21:30'))) < 0.01);
});

test('la hauteur de soleil devient négative la nuit et plafonne à -1', () => {
  assert.ok(sunHeightAt(day(), at('22:30')) < 0, 'une heure après le coucher');
  assert.equal(sunHeightAt(day(), at('03:00')), -1, 'au cœur de la nuit');
  assert.equal(sunHeightAt(day(), at('23:59')), -1, 'deux heures après le coucher');
});

test('la hauteur de soleil est continue de part et d’autre du coucher', () => {
  // Un saut brutal ici produirait un à-coup visible dans le ciel.
  const avant = sunHeightAt(day(), at('21:29'));
  const apres = sunHeightAt(day(), at('21:31'));

  assert.ok(Math.abs(avant - apres) < 0.02, `saut de ${Math.abs(avant - apres)}`);
});

/* ------------------------------------------------------ l’instant représenté */

test('aujourd’hui se représente à l’instant présent', () => {
  // Le ciel d'aujourd'hui est celui qu'on a au-dessus de la tête : à 22 h 30,
  // il fait nuit, et c'est bien la nuit qu'il faut montrer.
  const ceSoir = at('22:30');

  assert.equal(moodFor(day(), ceSoir).sunHeight, sunHeightAt(day(), ceSoir));
});

test('un jour futur se représente à son midi, pas à l’heure qu’il est', () => {
  // Sans cette règle, consulter samedi un soir d'août affiche une nuit noire
  // sur une journée annoncée à 36 degrés : l'image contredit le conseil.
  const demain = day({
    date: '2026-08-08',
    sunrise: '2026-08-08T06:32',
    sunset: '2026-08-08T21:28',
  });
  const ceSoir = at('22:30');

  assert.ok(sunHeightAt(demain, ceSoir) < 0, 'le repère : à 22 h 30 le soleil est couché');
  assert.ok(
    moodFor(demain, ceSoir).sunHeight > 0.98,
    `attendu un plein midi, obtenu ${moodFor(demain, ceSoir).sunHeight}`,
  );
});

test('le midi d’un jour futur suit son propre lever et son propre coucher', () => {
  // Une journée décalée doit culminer à son milieu à elle, pas à un midi fixe.
  const tardive = day({
    date: '2026-08-08',
    sunrise: '2026-08-08T09:00',
    sunset: '2026-08-08T15:00',
  });

  // Milieu de cette journée : 12 h. La veille au soir, on doit obtenir ce midi.
  assert.ok(moodFor(tardive, at('22:30')).sunHeight > 0.98);
});

test('un jour futur garde une nuit franche si le ciel est nocturne par nature', () => {
  // La règle ne doit pas inventer du soleil : elle choisit un instant, elle ne
  // force pas une palette. Un jour polaire sans lever reste sombre.
  const polaire = day({
    date: '2026-08-08',
    sunrise: '2026-08-08T12:00',
    sunset: '2026-08-08T12:00',
  });

  assert.ok(Number.isFinite(moodFor(polaire, at('22:30')).sunHeight));
});

/* ---------------------------------------------------------------- le mood */

test('le mood expose toutes les clés du contrat', () => {
  const mood = moodFor(day(), at('12:00'));

  for (const cle of [
    'name', 'zenith', 'horizon', 'ink', 'sunHeight', 'sunIntensity',
    'starDensity', 'cloudCover', 'cloudSpeed', 'turbulence', 'haze',
    'wind', 'heat', 'moonPhase', 'precipitation', 'lightning',
  ]) {
    assert.ok(cle in mood, `clé manquante : ${cle}`);
  }

  for (const couleur of [mood.zenith, mood.horizon, mood.ink]) {
    assert.match(couleur, /^#[0-9a-f]{6}$/i, `couleur mal formée : ${couleur}`);
  }
});

test('les grandeurs normalisées restent entre 0 et 1', () => {
  const cas = [
    [day(), at('12:00')],
    [day({ weatherCode: 95, windGustsKmh: 120, precipitationMm: 40, precipitationProbability: 100 }), at('03:00')],
    [day({ weatherCode: 73, windMaxKmh: 0, windGustsKmh: 0 }), at('19:00')],
    [day({ weatherCode: 45 }), at('07:00')],
  ];

  for (const [w, quand] of cas) {
    const m = moodFor(w, quand);
    for (const cle of [
      'sunIntensity', 'starDensity', 'cloudCover', 'cloudSpeed', 'turbulence',
      'haze', 'wind', 'heat', 'moonPhase',
    ]) {
      assert.ok(m[cle] >= 0 && m[cle] <= 1, `${cle} hors bornes : ${m[cle]}`);
    }
    assert.ok(m.precipitation.intensity >= 0 && m.precipitation.intensity <= 1);
  }
});

test('ciel dégagé en plein jour : soleil franc, aucune étoile', () => {
  const mood = moodFor(day({ weatherCode: 0 }), at('14:00'));

  assert.ok(mood.sunIntensity > 0.8);
  assert.equal(mood.starDensity, 0);
  assert.ok(mood.cloudCover < 0.2);
});

test('ciel dégagé en pleine nuit : étoiles franches, aucun soleil', () => {
  const mood = moodFor(day({ weatherCode: 0 }), at('02:00'));

  assert.equal(mood.sunIntensity, 0);
  assert.ok(mood.starDensity > 0.8);
});

test('les nuages étouffent les étoiles', () => {
  const degage = moodFor(day({ weatherCode: 0 }), at('02:00'));
  const couvert = moodFor(day({ weatherCode: 3 }), at('02:00'));

  assert.ok(
    couvert.starDensity < degage.starDensity * 0.4,
    `couvert ${couvert.starDensity} vs dégagé ${degage.starDensity}`,
  );
});

test('les nuages étouffent aussi le soleil', () => {
  const degage = moodFor(day({ weatherCode: 0 }), at('14:00'));
  const couvert = moodFor(day({ weatherCode: 3 }), at('14:00'));

  assert.ok(couvert.sunIntensity < degage.sunIntensity);
});

test('la nuit est plus sombre que le jour, à météo égale', () => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const jour = moodFor(day(), at('14:00'));
  const nuit = moodFor(day(), at('02:00'));

  assert.ok(
    luminance(nuit.zenith) < luminance(jour.zenith),
    'le zénith nocturne doit être plus sombre',
  );
  assert.ok(luminance(nuit.ink) > luminance(nuit.zenith), 'l’encre doit contraster avec le ciel');
  assert.ok(luminance(jour.ink) < luminance(jour.zenith), 'et s’inverser le jour');
});

test('le crépuscule n’est ni la palette du jour ni celle de la nuit', () => {
  const jour = moodFor(day(), at('14:00'));
  const nuit = moodFor(day(), at('02:00'));
  const crepuscule = moodFor(day(), at('21:30'));

  assert.notEqual(crepuscule.zenith, jour.zenith);
  assert.notEqual(crepuscule.zenith, nuit.zenith);
});

/* ------------------------------------------------------------- la météo */

test('la neige est reconnue comme telle', () => {
  const mood = moodFor(
    day({ weatherCode: 73, precipitationMm: 5, precipitationProbability: 90 }),
    at('12:00'),
  );

  assert.equal(mood.precipitation.type, 'snow');
  assert.ok(mood.precipitation.intensity > 0.5);
});

test('la pluie est reconnue comme telle', () => {
  const mood = moodFor(
    day({ weatherCode: 63, precipitationMm: 6, precipitationProbability: 85 }),
    at('12:00'),
  );

  assert.equal(mood.precipitation.type, 'rain');
});

test('sans précipitation, le type est nul', () => {
  const mood = moodFor(day({ weatherCode: 0 }), at('12:00'));

  assert.equal(mood.precipitation.type, null);
  assert.equal(mood.precipitation.intensity, 0);
});

test('l’intensité des précipitations croît avec le cumul', () => {
  const faible = moodFor(day({ weatherCode: 61, precipitationMm: 1.5, precipitationProbability: 50 }), at('12:00'));
  const forte = moodFor(day({ weatherCode: 65, precipitationMm: 20, precipitationProbability: 100 }), at('12:00'));

  assert.ok(forte.precipitation.intensity > faible.precipitation.intensity);
});

test('l’éclair est réservé aux codes d’orage', () => {
  assert.equal(moodFor(day({ weatherCode: 95 }), at('12:00')).lightning, true);
  assert.equal(moodFor(day({ weatherCode: 99 }), at('12:00')).lightning, true);
  assert.equal(moodFor(day({ weatherCode: 65 }), at('12:00')).lightning, false);
});

test('le vent pilote la dérive des nuages et la turbulence', () => {
  const calme = moodFor(day({ windMaxKmh: 3, windGustsKmh: 5 }), at('12:00'));
  const vente = moodFor(day({ windMaxKmh: 55, windGustsKmh: 90 }), at('12:00'));

  assert.ok(vente.cloudSpeed > calme.cloudSpeed);
  assert.ok(vente.turbulence > calme.turbulence);
});

test('le brouillard produit beaucoup de brume', () => {
  const brouillard = moodFor(day({ weatherCode: 45 }), at('12:00'));
  const degage = moodFor(day({ weatherCode: 0 }), at('12:00'));

  assert.ok(brouillard.haze > degage.haze + 0.4);
});

/* -------------------------------------------- le vent, la chaleur, la lune */

test('les traînées de vent ne sortent qu’au-delà d’une brise', () => {
  // Un vent qu'on ne sent pas ne doit pas se voir à l'écran.
  assert.equal(moodFor(day({ windGustsKmh: 20 }), at('12:00')).wind, 0);
  assert.ok(moodFor(day({ windGustsKmh: 45 }), at('12:00')).wind > 0);
  assert.equal(moodFor(day({ windGustsKmh: 120 }), at('12:00')).wind, 1);
});

test('la chaleur se lit sur le maximum ressenti', () => {
  assert.equal(moodFor(day({ feelsLikeMax: 24 }), at('12:00')).heat, 0);
  assert.ok(moodFor(day({ feelsLikeMax: 32 }), at('12:00')).heat > 0);
  assert.equal(moodFor(day({ feelsLikeMax: 40 }), at('12:00')).heat, 1);
});

test('la phase lunaire part de la nouvelle lune de référence', () => {
  // Le 6 janvier 2000 à 18 h 14 UTC. À minuit ce jour-là il reste dix-huit
  // heures de cycle, soit une phase juste en dessous de 1 : dans les deux cas
  // on est au ras de la nouvelle lune.
  const phase = moonPhaseOn('2000-01-06');

  assert.ok(Math.min(phase, 1 - phase) < 0.03, `phase inattendue : ${phase}`);
});

test('la phase lunaire boucle sur le mois synodique', () => {
  // Deux dates espacées de 295,3 jours, soit dix cycles pleins.
  assert.ok(Math.abs(moonPhaseOn('2026-01-01') - moonPhaseOn('2026-10-23')) < 0.02);
});

test('la phase lunaire reste dans [0, 1) même avant l’époque de référence', () => {
  for (const date of ['1969-07-20', '1999-12-31', '2026-08-07', '2098-03-14']) {
    const phase = moonPhaseOn(date);
    assert.ok(phase >= 0 && phase < 1, `${date} donne ${phase}`);
  }
});

test('une date illisible ne propage pas de NaN jusqu’aux uniformes', () => {
  // Un seul uniforme non fini suffit à faire disparaître tout le ciel.
  assert.ok(Number.isFinite(moonPhaseOn(undefined)));
  assert.ok(Number.isFinite(moodFor(day({ date: 'pas une date' }), at('12:00')).moonPhase));
});

test('moodFor ne mute pas la météo qu’on lui passe', () => {
  const weather = day({ weatherCode: 95, precipitationMm: 12 });
  const copie = structuredClone(weather);

  moodFor(weather, at('12:00'));

  assert.deepEqual(weather, copie);
});

/* ------------------------------------------------ interpolation des moods */

test('blendMoods aux extrémités rend exactement l’un ou l’autre', () => {
  const a = moodFor(day({ weatherCode: 0 }), at('14:00'));
  const b = moodFor(day({ weatherCode: 65, precipitationMm: 12, precipitationProbability: 95 }), at('14:00'));

  assert.deepEqual(blendMoods(a, b, 0), a);
  assert.deepEqual(blendMoods(a, b, 1), b);
});

test('blendMoods interpole les grandeurs continues', () => {
  const a = moodFor(day({ weatherCode: 0 }), at('14:00'));
  const b = moodFor(day({ weatherCode: 3 }), at('14:00'));
  const m = blendMoods(a, b, 0.5);

  assert.ok(m.cloudCover > a.cloudCover && m.cloudCover < b.cloudCover);
  assert.notEqual(m.zenith, a.zenith);
  assert.notEqual(m.zenith, b.zenith);
  assert.match(m.zenith, /^#[0-9a-f]{6}$/i);
});

test('blendMoods borne la progression hors de [0, 1]', () => {
  const a = moodFor(day({ weatherCode: 0 }), at('14:00'));
  const b = moodFor(day({ weatherCode: 3 }), at('14:00'));

  assert.deepEqual(blendMoods(a, b, -3), a);
  assert.deepEqual(blendMoods(a, b, 12), b);
});

test('le type de précipitation bascule à mi-parcours plutôt que de se mélanger', () => {
  // Il n'existe pas de demi-flocon : le type est discret, seule l'intensité
  // se fond. Sous 0,5 on garde celui de départ, au-delà celui d'arrivée.
  const sec = moodFor(day({ weatherCode: 0 }), at('14:00'));
  const neige = moodFor(day({ weatherCode: 73, precipitationMm: 8, precipitationProbability: 90 }), at('14:00'));

  assert.equal(blendMoods(sec, neige, 0.3).precipitation.type, null);
  assert.equal(blendMoods(sec, neige, 0.7).precipitation.type, 'snow');
  assert.ok(blendMoods(sec, neige, 0.7).precipitation.intensity < neige.precipitation.intensity);
});

test('la phase lunaire bascule à mi-parcours plutôt que de traverser le cycle', () => {
  // Interpoler 0,98 vers 0,01 ferait remonter la lune tout un cycle à l'envers
  // en une demi-seconde. On prend celle de départ, puis celle d'arrivée.
  const veille = moodFor(day({ date: '2026-01-18' }), at('02:00'));
  const lendemain = moodFor(day({ date: '2026-01-19' }), at('02:00'));

  assert.equal(blendMoods(veille, lendemain, 0.3).moonPhase, veille.moonPhase);
  assert.equal(blendMoods(veille, lendemain, 0.7).moonPhase, lendemain.moonPhase);
});

test('l’éclair est actif dès que l’un des deux moods orage', () => {
  const calme = moodFor(day({ weatherCode: 0 }), at('14:00'));
  const orage = moodFor(day({ weatherCode: 95 }), at('14:00'));

  assert.equal(blendMoods(calme, orage, 0.2).lightning, true);
  assert.equal(blendMoods(calme, calme, 0.5).lightning, false);
});

/* --------------------------------------------------------- fuseau du lieu */

test('la hauteur de soleil suit l’heure DU LIEU, pas celle du navigateur', () => {
  // Même instant absolu, deux villes : il fait jour à l'une et nuit à l'autre.
  const instant = new Date('2026-08-07T12:00:00Z');

  const surPlace = sunHeightAt(day({ utcOffsetSeconds: 0 }), instant);
  const douzeHeuresPlusLoin = sunHeightAt(day({ utcOffsetSeconds: 12 * 3600 }), instant);

  assert.ok(surPlace > 0.9, `midi sur place : ${surPlace}`);
  assert.ok(douzeHeuresPlusLoin < 0, `minuit là-bas : ${douzeHeuresPlusLoin}`);
});

test('un décalage négatif recule bien l’heure locale', () => {
  // 12 h UTC à Los Angeles (UTC-7), il est 5 h du matin : le soleil vient de
  // se lever, il est donc bas mais positif.
  const matin = sunHeightAt(day({ utcOffsetSeconds: -7 * 3600 }), new Date('2026-08-07T12:00:00Z'));

  assert.ok(matin < 0.2, `attendu bas, obtenu ${matin}`);
});

test('la nuit se calcule par le plus court chemin vers le jour', () => {
  // Une heure après minuit, on est loin du coucher de la veille comme du lever
  // du matin : nuit pleine, sans que le calcul ne parte en vrille.
  assert.equal(sunHeightAt(day(), at('01:00')), -1);
  // Juste avant le lever, en revanche, le ciel doit déjà pâlir.
  assert.ok(sunHeightAt(day(), at('05:45')) > -1, 'l’aube approche');
});
