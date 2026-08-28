import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTrip, isTrip, quantityFor } from '../js/packing.js';

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

/* ------------------------------------------------------------- les quantités */

/** Un séjour d'une ville, un ressenti par jour, à partir du 2 septembre. */
function sejour(feelsLikes, overridesParJour = {}) {
  const dates = feelsLikes.map((_, i) => nextIso('2026-09-02', i));

  return {
    trip: {
      id: 'trip-q',
      start: dates[0],
      end: dates[dates.length - 1],
      stops: [{ place: LISBONNE, from: dates[0] }],
      packed: [],
    },
    forecasts: [feelsLikes.map((f, i) => day(dates[i], f, overridesParJour[i] ?? {}))],
  };
}

/** `n` jours après une date ISO courte. */
function nextIso(date, n) {
  const t = new Date(`${date}T12:00:00Z`).getTime() + n * 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** La ligne d'une racine donnée, ou undefined. */
function ligne(valise, key) {
  return valise.wear.find((item) => item.key === key);
}

test('cinq jours dont deux frais ne donnent qu’un pull', () => {
  // C'est la règle qui distingue une valise d'une multiplication : la quantité
  // vient des jours qui réclament la pièce, pas de la durée du séjour.
  const { trip, forecasts } = sejour([22, 22, 22, 10, 10]);
  const valise = buildTrip(trip, forecasts, MORNING);

  const pull = ligne(valise, 'pull');
  assert.equal(pull.count, 1);
  assert.deepEqual(pull.days, ['2026-09-05', '2026-09-06']);
});

test('les pièces à même la peau se renouvellent chaque jour', () => {
  const { trip, forecasts } = sejour([22, 22, 22]);

  assert.equal(ligne(buildTrip(trip, forecasts, MORNING), 't-shirt').count, 3);
});

test('au-delà de sept jours on lave, et la ligne le signale', () => {
  const { trip, forecasts } = sejour(Array.from({ length: 10 }, () => 22));
  const tshirt = ligne(buildTrip(trip, forecasts, MORNING), 't-shirt');

  assert.equal(tshirt.count, 7);
  assert.equal(tshirt.capped, true);
  assert.equal(tshirt.days.length, 10, 'les dix jours restent la raison de la ligne');
});

test('un séjour court ne lève pas le plafond', () => {
  const { trip, forecasts } = sejour([22, 22, 22]);

  assert.equal(ligne(buildTrip(trip, forecasts, MORNING), 't-shirt').capped, false);
});

test('le bas se renouvelle un pour quatre jours', () => {
  const { trip, forecasts } = sejour(Array.from({ length: 5 }, () => 22));

  assert.equal(ligne(buildTrip(trip, forecasts, MORNING), 'pantalon').count, 2);
});

test('quatre jours pile distinguent une période de quatre d’une période de trois', () => {
  // À cinq jours (test précédent), une période de trois donnerait la même
  // réponse qu'une période de quatre : ceil(5/3) = ceil(5/4) = 2, le nombre
  // de jours ne prouve rien à lui seul. À quatre jours pile, les deux se
  // séparent : ceil(4/4) = 1, ceil(4/3) = 2 — seule la bonne période passe.
  const { trip, forecasts } = sejour(Array.from({ length: 4 }, () => 22));

  assert.equal(ligne(buildTrip(trip, forecasts, MORNING), 'pantalon').count, 1);
});

test('short et jean coexistent : deux racines, deux lignes', () => {
  const { trip, forecasts } = sejour([27, 27, 10, 10]);
  const valise = buildTrip(trip, forecasts, MORNING);

  assert.equal(ligne(valise, 'short').count, 1);
  assert.equal(ligne(valise, 'jean').count, 1);
});

test('deux villes ne font qu’une liste', () => {
  // L'union ne s'est jamais souciée d'où venait la journée : le multi-étapes ne
  // doit rien coûter à l'agrégation.
  const trip = {
    id: 'trip-m',
    start: '2026-09-02',
    end: '2026-09-05',
    stops: [
      { place: LISBONNE, from: '2026-09-02' },
      { place: PORTO, from: '2026-09-04' },
    ],
    packed: [],
  };
  const dates = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
  const forecasts = [dates.map((d) => day(d, 10)), dates.map((d) => day(d, 10))];

  const pull = ligne(buildTrip(trip, forecasts, MORNING), 'pull');
  assert.equal(pull.count, 2, 'quatre jours de pull, un pour trois');
  assert.deepEqual(pull.days, dates, 'les jours des deux villes, dans l’ordre');
});

test('jamais deux couches extérieures : la plus couvrante gagne', () => {
  // Un jour de pluie à 20 °C réclame un imperméable, un jour sec à 2 °C un
  // manteau. On n'emporte pas les deux — et le parapluie du jour humide est
  // déjà dans ce qu'on emporte.
  const { trip, forecasts } = sejour([20, 2], {
    0: { precipitationProbability: 80, precipitationMm: 4, weatherCode: 61 },
  });
  const valise = buildTrip(trip, forecasts, MORNING);

  const couche = ligne(valise, 'couche');
  assert.equal(couche.count, 1);
  assert.deepEqual(couche.pieces, [{ name: 'manteau', count: 1 }]);
  assert.equal(valise.wear.filter((i) => i.key === 'couche').length, 1);
});

test('la table de couverture tranche, même quand le jour le plus froid dirait l’inverse', () => {
  // Un jour venteux à 12 °C sort un coupe-vent ; un jour calme à 6 °C, plus
  // froid, sort une veste. Un tri au ressenti le plus froid choisirait la
  // veste — elle est demandée par le jour le plus froid des deux. La table
  // choisit le coupe-vent : c'est `OUTER_ORDER`, pas la température, qui fixe
  // la couverture des couches extérieures (voir le commentaire de `byCoverage`).
  const { trip, forecasts } = sejour([12, 6], {
    0: { windGustsKmh: 50 },
  });
  const valise = buildTrip(trip, forecasts, MORNING);

  const couche = ligne(valise, 'couche');
  assert.equal(couche.count, 1);
  assert.deepEqual(couche.pieces, [{ name: 'coupe-vent', count: 1 }]);
});

test('ce qu’on emporte compte un exemplaire, quel que soit le nombre de jours', () => {
  const pluvieux = { precipitationProbability: 80, precipitationMm: 4, weatherCode: 61 };
  const { trip, forecasts } = sejour([16, 16, 16], { 0: pluvieux, 1: pluvieux, 2: pluvieux });
  const valise = buildTrip(trip, forecasts, MORNING);

  const parapluies = valise.carry.filter((item) => item.key === 'parapluie');
  assert.equal(parapluies.length, 1);
  assert.equal(parapluies[0].days.length, 3, 'les trois jours restent la raison');
});

test('le grand froid renouvelle sa sous-couche, pas son pull', () => {
  const { trip, forecasts } = sejour([-8, -8, -8, -8, -8, -8]);
  const valise = buildTrip(trip, forecasts, MORNING);

  assert.equal(ligne(valise, 'sous-couche').count, 6, 'la sous-couche est une pièce de peau');
  assert.equal(ligne(valise, 'pull').count, 2, 'six jours de pull épais, un pour trois');
});

test('un seul exemplaire prend le poids le plus couvrant, pas le premier porté', () => {
  // Le pull fin est porté le premier jour, le pull épais le second : dans cet
  // ordre, un tri manquant ou une lecture brute du premier élément renverrait
  // le pull fin. C'est pourtant le pull épais, le plus couvrant des deux, qui
  // doit sortir — peu importe qu'il arrive en second.
  const { trip, forecasts } = sejour([11, -2]);
  const valise = buildTrip(trip, forecasts, MORNING);

  const pull = ligne(valise, 'pull');
  assert.equal(pull.count, 1);
  assert.deepEqual(pull.pieces, [{ name: 'pull épais', count: 1 }]);
});

test('deux exemplaires prennent un de chaque poids, le plus couvrant en tête', () => {
  const { trip, forecasts } = sejour([11, 11, -2, -2]);
  const valise = buildTrip(trip, forecasts, MORNING);

  const pull = ligne(valise, 'pull');
  assert.equal(pull.count, 2);
  assert.deepEqual(pull.pieces, [
    { name: 'pull épais', count: 1 },
    { name: 'pull fin', count: 1 },
  ]);
});

test('une racine inconnue du barème tombe dans la classe relais', () => {
  // Un palier ajouté plus tard, un mot changé dans rules.js : mieux vaut une
  // pièce de trop qu'une pièce oubliée. Aucune prévision réelle ne peut
  // produire cette racine aujourd'hui — d'où l'appel direct.
  assert.deepEqual(quantityFor('poncho', 6), { count: 2, capped: false });
  assert.deepEqual(quantityFor('poncho', 1), { count: 1, capped: false });
});

test('le plafond ne s’applique qu’aux pièces de peau', () => {
  assert.deepEqual(quantityFor('t-shirt', 10), { count: 7, capped: true });
  assert.deepEqual(quantityFor('pull', 30), { count: 10, capped: false });
  assert.deepEqual(quantityFor('couche', 30), { count: 1, capped: false });
});

test('le plafond ne mord qu’au-delà de sept, jamais à sept pile', () => {
  // `> DAILY_CAP`, pas `>=` : sept jours d'affilée avec le même t-shirt est
  // encore un usage ordinaire d'une pièce de peau, la coupe ne doit tomber
  // qu'au huitième jour.
  assert.deepEqual(quantityFor('t-shirt', 7), { count: 7, capped: false });
  assert.deepEqual(quantityFor('t-shirt', 8), { count: 7, capped: true });
});

test('le vestiaire choisi traverse l’agrégation', () => {
  const { trip, forecasts } = sejour([27, 27]);
  const valise = buildTrip(trip, forecasts, MORNING, 'femme');

  assert.match(ligne(valise, 'short').pieces[0].name, /jupe/);
});

test('les jours d’une ligne nomment les journées qui la réclament, dans l’ordre', () => {
  const { trip, forecasts } = sejour([22, 10, 22, 10]);

  assert.deepEqual(ligne(buildTrip(trip, forecasts, MORNING), 'pull').days, [
    '2026-09-03',
    '2026-09-05',
  ]);
});
