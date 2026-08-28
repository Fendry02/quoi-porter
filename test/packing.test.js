import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTrip, isTrip } from '../js/packing.js';

const MORNING = new Date('2026-09-01T08:00:00Z');

/** Vingt-quatre heures plates : de quoi laisser les phrases se construire. */
function hours(feelsLike) {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    temp: feelsLike,
    feelsLike,
    precipitationMm: 0,
    precipitationProbability: 0,
    windGustsKmh: 10,
    feelsLikeLow: null,
    feelsLikeHigh: null,
  }));
}

/** Un DayWeather normalisé, réglé par son ressenti. */
function day(date, feelsLike, overrides = {}) {
  return {
    date,
    tempMin: feelsLike,
    tempMax: feelsLike + 4,
    feelsLikeMin: feelsLike,
    feelsLikeMax: feelsLike + 4,
    precipitationMm: 0,
    precipitationProbability: 0,
    windMaxKmh: 10,
    windGustsKmh: 10,
    uvIndex: 2,
    weatherCode: 1,
    conditionDissent: null,
    sunrise: `${date}T07:00`,
    sunset: `${date}T20:00`,
    utcOffsetSeconds: 0,
    hours: hours(feelsLike),
    feelsLikeSpread: null,
    modelCount: 5,
    ...overrides,
  };
}

const LISBONNE = { name: 'Lisbonne, Portugal', latitude: 38.72, longitude: -9.14 };
const PORTO = { name: 'Porto, Portugal', latitude: 41.15, longitude: -8.61 };

/** Un séjour d'une seule ville, du 2 au 4 septembre. */
function sejourSimple(feelsLikes = [22, 22, 22]) {
  return {
    trip: {
      id: 'trip-1',
      start: '2026-09-02',
      end: '2026-09-04',
      stops: [{ place: LISBONNE, from: '2026-09-02' }],
      packed: [],
    },
    forecasts: [feelsLikes.map((f, i) => day(`2026-09-0${2 + i}`, f))],
  };
}

test('chaque journée du séjour reçoit son libellé, son lieu et sa tenue', () => {
  const { trip, forecasts } = sejourSimple();
  const valise = buildTrip(trip, forecasts, MORNING);

  assert.equal(valise.days.length, 3);
  assert.equal(valise.days[0].id, '2026-09-02');
  assert.equal(valise.days[0].label, 'mer. 2 sept.');
  assert.equal(valise.days[0].place.name, 'Lisbonne, Portugal');
  assert.match(valise.days[0].phrasing.wear, /t-shirt/i);
  assert.equal(valise.days[0].outfit.layers.bottom, 'pantalon léger');
});

test('le voyage est rendu tel quel, pour que la mise en mots y lise les villes', () => {
  const { trip, forecasts } = sejourSimple();

  assert.deepEqual(buildTrip(trip, forecasts, MORNING).trip, trip);
});

test('chaque étape apporte les journées de sa ville', () => {
  const trip = {
    id: 'trip-2',
    start: '2026-09-02',
    end: '2026-09-05',
    stops: [
      { place: LISBONNE, from: '2026-09-02' },
      { place: PORTO, from: '2026-09-04' },
    ],
    packed: [],
  };
  const forecasts = [
    ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((d) => day(d, 24)),
    ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((d) => day(d, 16)),
  ];

  const jours = buildTrip(trip, forecasts, MORNING).days;

  assert.deepEqual(
    jours.map((j) => [j.id, j.place.name.split(',')[0]]),
    [
      ['2026-09-02', 'Lisbonne'],
      ['2026-09-03', 'Lisbonne'],
      ['2026-09-04', 'Porto'],
      ['2026-09-05', 'Porto'],
    ],
    'une étape court jusqu’au jour où commence la suivante, exclu',
  );
});

test('un séjour commencé ne parle que des jours qui restent', () => {
  const trip = {
    id: 'trip-3',
    start: '2026-08-30',
    end: '2026-09-02',
    stops: [{ place: LISBONNE, from: '2026-08-30' }],
    packed: [],
  };
  const forecasts = [[day('2026-09-01', 22), day('2026-09-02', 22)]];

  const valise = buildTrip(trip, forecasts, MORNING);

  assert.deepEqual(valise.days.map((j) => j.id), ['2026-09-01', '2026-09-02']);
  assert.equal(valise.days[0].label, 'Aujourd’hui', 'le premier jour restant est aujourd’hui');
  assert.deepEqual(valise.horizon.missing, [], 'un jour passé n’est pas un jour manquant');
});

test('« passé » se juge à la date du lieu, pas à celle du téléphone', () => {
  // Il est le 1er septembre à 23 h UTC, donc déjà le 2 à Tokyo. Le 2 ne doit pas
  // être proposé comme un jour à venir pour un séjour qui s'y déroule.
  const tokyo = { name: 'Tokyo, Japon', latitude: 35.68, longitude: 139.69 };
  const trip = {
    id: 'trip-4',
    start: '2026-09-01',
    end: '2026-09-03',
    stops: [{ place: tokyo, from: '2026-09-01' }],
    packed: [],
  };
  const decalage = 9 * 3600;
  const forecasts = [
    ['2026-09-02', '2026-09-03'].map((d) => day(d, 24, { utcOffsetSeconds: decalage })),
  ];

  const valise = buildTrip(trip, forecasts, new Date('2026-09-01T23:00:00Z'));

  assert.deepEqual(valise.days.map((j) => j.id), ['2026-09-02', '2026-09-03']);
  assert.equal(valise.days[0].label, 'Aujourd’hui', 'à Tokyo, le 2 est déjà aujourd’hui');
});

test('un jour hors de la fenêtre de prévision est compté, jamais inventé', () => {
  const trip = {
    id: 'trip-5',
    start: '2026-09-02',
    end: '2026-09-05',
    stops: [{ place: LISBONNE, from: '2026-09-02' }],
    packed: [],
  };
  const forecasts = [[day('2026-09-02', 22), day('2026-09-03', 22)]];

  const valise = buildTrip(trip, forecasts, MORNING);

  assert.deepEqual(valise.horizon.covered, ['2026-09-02', '2026-09-03']);
  assert.deepEqual(valise.horizon.missing, ['2026-09-04', '2026-09-05']);
  assert.equal(valise.days.length, 2, 'aucune journée inventée');
});

test('une étape dont la requête a échoué ne fait pas perdre les autres', () => {
  const trip = {
    id: 'trip-6',
    start: '2026-09-02',
    end: '2026-09-03',
    stops: [
      { place: LISBONNE, from: '2026-09-02' },
      { place: PORTO, from: '2026-09-03' },
    ],
    packed: [],
  };
  const forecasts = [[day('2026-09-02', 24)], []];

  const valise = buildTrip(trip, forecasts, MORNING);

  assert.deepEqual(valise.days.map((j) => j.id), ['2026-09-02']);
  assert.deepEqual(valise.horizon.missing, ['2026-09-03']);
});

test('un voyage sans étape ne fait pas tomber l’écran', () => {
  const vide = buildTrip({ id: 'x', start: '2026-09-02', end: '2026-09-03', stops: [], packed: [] }, [], MORNING);

  assert.deepEqual(vide.days, []);
  assert.deepEqual(vide.wear, []);
  assert.deepEqual(vide.carry, []);
  assert.deepEqual(vide.notes, []);
});

test('une étape retirée rend ses jours à la précédente', () => {
  // C'est la contrepartie de « une étape ajoutée coupe la précédente » : rien à
  // recoudre, puisqu'une étape n'a qu'une date et que la fin se déduit.
  const stops = [
    { place: LISBONNE, from: '2026-09-02' },
    { place: PORTO, from: '2026-09-04' },
  ];
  const base = { id: 'trip-7', start: '2026-09-02', end: '2026-09-05', packed: [] };
  const prevision = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((d) => day(d, 22));

  const avec = buildTrip({ ...base, stops }, [prevision, prevision], MORNING);
  const sans = buildTrip({ ...base, stops: stops.slice(0, 1) }, [prevision], MORNING);

  assert.equal(avec.days.filter((j) => j.place === LISBONNE).length, 2);
  assert.equal(sans.days.filter((j) => j.place === LISBONNE).length, 4);
});

test('chaque jour reste apparié à la prévision de sa propre étape, même donnée dans le désordre', () => {
  // C'est le scénario qui aurait attrapé un tri qui réordonne les étapes sans
  // emporter leur prévision : Porto récupérerait alors les jours de Lisbonne,
  // et inversement, sans qu'aucune erreur ne le signale.
  const trip = {
    id: 'trip-9',
    start: '2026-09-02',
    end: '2026-09-05',
    stops: [
      { place: PORTO, from: '2026-09-04' },
      { place: LISBONNE, from: '2026-09-02' },
    ],
    packed: [],
  };
  const dates = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
  const forecasts = [
    dates.map((d) => day(d, 6)), // la prévision de Porto : assez froid pour un pull
    dates.map((d) => day(d, 28)), // la prévision de Lisbonne : assez chaud pour un short
  ];

  const jours = buildTrip(trip, forecasts, MORNING).days;
  const lisbonne = jours.filter((j) => j.place === LISBONNE);
  const porto = jours.filter((j) => j.place === PORTO);

  assert.equal(lisbonne.length, 2);
  assert.equal(porto.length, 2);
  assert.ok(
    lisbonne.every((j) => j.outfit.layers.bottom === 'short'),
    'Lisbonne garde sa propre prévision, la chaude',
  );
  assert.ok(
    porto.every((j) => j.outfit.layers.top.includes('pull')),
    'Porto garde sa propre prévision, la froide',
  );
});

/* --------------------------------------------------- ce qu'on lit du disque */

test('un voyage lisible est reconnu, un voyage abîmé est écarté', () => {
  // La garde vit dans le module pur pour être testée sous Node : le stockage de
  // l'app n'a pas de banc de test, et un voyage écrit par une version
  // antérieure ne doit pas empêcher l'écran d'ouvrir.
  const bon = {
    id: 'trip-8',
    start: '2026-09-02',
    end: '2026-09-04',
    stops: [{ place: LISBONNE, from: '2026-09-02' }],
    packed: [],
  };

  assert.equal(isTrip(bon), true);
  assert.equal(isTrip({ ...bon, stops: [] }), false, 'un voyage sans ville ne mène nulle part');
  assert.equal(
    isTrip({ ...bon, stops: [{ place: LISBONNE, from: '2026-09-03' }] }),
    false,
    'la première étape commence au départ, sinon le premier jour n’a pas de ville',
  );
  assert.equal(isTrip({ ...bon, start: undefined }), false);
  assert.equal(isTrip({ ...bon, stops: [{ place: { name: 'X' }, from: '2026-09-02' }] }), false);
  assert.equal(isTrip(null), false);
});

test('des étapes données dans le désordre ne font pas un voyage lisible', () => {
  // Sans cette règle, `legsOf` réordonnerait les étapes en silence pour
  // rétablir la chronologie — et déciderait, à la place de l'appelant, ce
  // que ce voyage voulait dire.
  const trip = {
    id: 'trip-10',
    start: '2026-09-02',
    end: '2026-09-06',
    stops: [
      { place: LISBONNE, from: '2026-09-02' },
      { place: PORTO, from: '2026-09-05' },
      { place: LISBONNE, from: '2026-09-04' },
    ],
    packed: [],
  };

  assert.equal(isTrip(trip), false, 'une étape ne peut pas commencer avant la précédente');
});

test('deux étapes à la même date ne font pas un voyage lisible', () => {
  const trip = {
    id: 'trip-11',
    start: '2026-09-02',
    end: '2026-09-04',
    stops: [
      { place: LISBONNE, from: '2026-09-02' },
      { place: PORTO, from: '2026-09-02' },
    ],
    packed: [],
  };

  assert.equal(isTrip(trip), false, 'deux étapes ne peuvent pas commencer le même jour');
});
