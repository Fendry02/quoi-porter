# Assistant valise — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Répondre à « je pars du 8 au 13 septembre à Lisbonne puis à Porto, dis-moi quoi emporter » — une liste avec quantités et raisons, le déroulé du séjour, des coches, et une bibliothèque de voyages.

**Architecture:** Un module pur d'agrégation, `js/packing.js`, appelle `buildOutfit()` sur chaque journée du séjour puis unit les tenues obtenues par racine de vêtement. `js/phrasing.js` le met en mots. L'app mobile ajoute un écran, un hook et une clé de stockage ; aucun composant React n'entre dans les modules purs, qui restent testés sous Node.

**Tech Stack:** JavaScript ES modules sans dépendance (moteur), `node --test` (tests), Expo SDK 57 / React Native 0.86 / expo-router / Reanimated 4 (app), `expo-sqlite/kv-store` (stockage natif), `localStorage` (stockage web).

**Spec:** [`docs/superpowers/specs/2026-08-28-assistant-valise-design.md`](../specs/2026-08-28-assistant-valise-design.md) — à lire en entier avant la tâche 1. Le plan applique le spec ; en cas de désaccord entre les deux, le spec gagne et le plan est corrigé.

## Global Constraints

- **Aucune dépendance nouvelle**, ni dans le moteur, ni dans l'app. Le projet n'a aucun `npm install` à faire pour tourner.
- **Les modules `js/*.js` sont purs** : aucun accès réseau, aucun DOM, aucun composant React. Ils ne tirent ni horloge ni hasard — l'instant courant arrive toujours en paramètre.
- **Frontières du projet** : `rules.js` décide, `packing.js` agrège, `phrasing.js` parle. Aucune phrase dans `packing.js` ; aucun calcul de quantité dans `phrasing.js`.
- **TDD** : le test échoue d'abord, on le lance pour le voir échouer, puis on écrit le minimum pour le faire passer. Tests en français, `import test from 'node:test'` et `import assert from 'node:assert/strict'`, comme les 303 tests existants.
- **Commandes de vérification** : `npm test` à la racine ; dans `apps/mobile`, `npm run typecheck` et `npm run lint`.
- **Avant d'écrire une ligne de code Expo** (tâches 8 à 15), lire les docs versionnées exactes : https://docs.expo.dev/versions/v57.0.0/ — c'est une consigne du dépôt (`apps/mobile/AGENTS.md`), pas un conseil.
- **Langue** : identifiants et noms de fichiers en anglais, commentaires et textes affichés en français, tutoiement (« Réessaie », « tu laveras »).
- **Espace insécable** : `NBSP` s'importe depuis `js/hours.js`, jamais recopié — une copie de ce caractère invisible a déjà dérivé en espace ordinaire sans que rien ne le montre.
- **Quantités et plafond, valeurs exactes** : périodes 1 jour (`t-shirt`, `sous-couche`), 3 jours (`chemise`, `pull`), 4 jours (`short`, `pantalon`, `jean`), racine inconnue → 3 jours. Plafond 7 sur les racines de période 1. Couche extérieure : 1 en tout, ordre de couverture `manteau` > `imperméable` > `coupe-vent` > `veste`.
- **Commits fréquents**, un par tâche au minimum, message en `type: sujet` sans emoji.

---

# Étape A — le moteur multi-étapes

Aucun écran. À la fin de l'étape A, la valise est démontrable sous Node.

### Task 1: `modelCount` — combien de centres de prévision répondent encore

**Files:**
- Modify: `js/weather.js` (la fonction `normalizeForecast`, vers la ligne 162)
- Test: `test/weather.test.js`

**Interfaces:**
- Consumes: rien.
- Produces: chaque `DayWeather` porte `modelCount: number` — le nombre de modèles ayant publié une valeur d'`apparent_temperature_max` ce jour-là. Vaut `1` dans le repli mono-requête, `0` si la journée n'a aucune valeur.

**Pourquoi** : au-delà du 7ᵉ jour, Météo-France et l'ICON ont cessé de publier ; il ne reste qu'ECMWF et GFS, puis GFS seul au 16ᵉ. L'écart entre deux modèles ressemble à l'écart entre cinq, en plus petit. Sans ce compte, l'app serait la plus sûre d'elle exactement là où elle en sait le moins.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `test/weather.test.js`, à la suite des tests de `normalizeForecast` :

```js
test('chaque journée dit combien de modèles ont répondu', () => {
  // Au douzième jour, Météo-France et l'ICON ont cessé de publier : la journée
  // doit le dire, sinon l'app afficherait la même assurance qu'au premier jour.
  const jours = normalizeForecast({
    utc_offset_seconds: 0,
    daily: {
      time: ['2026-09-01', '2026-09-12'],
      apparent_temperature_max_ecmwf_ifs025: [24, 25],
      apparent_temperature_max_gfs_seamless: [23, 26],
      apparent_temperature_max_meteofrance_seamless: [24, null],
      apparent_temperature_max_icon_seamless: [25, null],
      apparent_temperature_max_ukmo_seamless: [23, null],
      apparent_temperature_min_ecmwf_ifs025: [14, 15],
      temperature_2m_min_ecmwf_ifs025: [13, 14],
      temperature_2m_max_ecmwf_ifs025: [24, 25],
    },
  });

  assert.equal(jours[0].modelCount, 5);
  assert.equal(jours[1].modelCount, 2);
});

test('le repli mono-requête compte une source, pas zéro', () => {
  // Sans suffixe de modèle, la réponse ne dit pas qui parle — mais quelqu'un
  // parle, et zéro ferait croire à une journée sans prévision.
  const [jour] = normalizeForecast({
    utc_offset_seconds: 0,
    daily: {
      time: ['2026-09-01'],
      apparent_temperature_max: [24],
      apparent_temperature_min: [14],
      temperature_2m_min: [13],
      temperature_2m_max: [24],
    },
  });

  assert.equal(jour.modelCount, 1);
});
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `node --test test/weather.test.js`
Expected: FAIL — `modelCount` vaut `undefined`, les deux assertions tombent.

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `js/weather.js`, juste avant `export function normalizeForecast`, ajouter :

```js
/**
 * Combien de centres de prévision ont réellement parlé ce jour-là.
 *
 * On compte sur l'`apparent_temperature_max` et non sur n'importe quelle
 * variable : c'est la grandeur sur laquelle tout le moteur décide. Un modèle qui
 * publie la température mais pas le ressenti ne compte pas pour ce qui nous sert.
 *
 * Sans modèle nommé — le repli mono-requête — on lit le champ sans suffixe : il
 * y a bien une source, et rendre zéro ferait passer la journée pour muette.
 */
function modelCountOf(daily, models, i) {
  const valeurs = acrossModels(daily, 'apparent_temperature_max', models, i);
  return valeurs.filter((v) => Number.isFinite(v)).length;
}
```

Puis, dans l'objet rendu par `normalizeForecast().map()`, à côté de `feelsLikeSpread` :

```js
      feelsLikeSpread: spreadOfDay(hours),
      // Ce que l'app doit savoir pour ne pas paraître sûre d'elle au douzième
      // jour, quand il ne reste qu'un modèle ou deux.
      modelCount: modelCountOf(daily, models, i),
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS — 305 tests, aucun échec. Les tests existants ne bougent pas : le champ est additif.

- [ ] **Step 5: Commit**

```bash
git add js/weather.js test/weather.test.js
git commit -m "feat: dire combien de modeles repondent encore, jour par jour"
```

---

### Task 2: `dayLabel` remonte dans `hours.js`

**Files:**
- Modify: `js/hours.js` (ajout en fin de fichier)
- Modify: `js/mobile.js` (retirer la fonction locale, l'importer)
- Test: `test/hours.test.js`, et `test/mobile.test.js` doit rester vert sans modification

**Interfaces:**
- Consumes: rien.
- Produces: `dayLabel(date: string, isToday: boolean) => string` exportée par `js/hours.js`. `dayLabel('2026-09-09', false)` → `'mer. 9 sept.'` ; `isToday` vrai → `'Aujourd’hui'`.

**Pourquoi** : la fonction est aujourd'hui locale à `mobile.js`. `packing.js` en a besoin ; l'importer depuis `mobile.js` ferait dépendre l'agrégation du module de contrat mobile, soit l'inverse du sens des dépendances. Elle rejoint `placeDate()`, avec qui elle partage son sujet.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `test/hours.test.js` :

```js
test('le libellé d’une journée nomme le jour, le mois, et dit « aujourd’hui »', () => {
  assert.equal(dayLabel('2026-09-09', false), 'mer. 9 sept.');
  assert.equal(dayLabel('2026-09-09', true), 'Aujourd’hui');
});

test('le libellé ne bascule pas sur le jour voisin selon le fuseau du lecteur', () => {
  // La date est déjà locale au lieu : la lire à minuit ferait basculer d'un jour
  // dans un fuseau négatif. D'où l'heure de midi dans la conversion.
  assert.match(dayLabel('2026-01-01', false), /1 janv\./);
});
```

Ajouter `dayLabel` à l'import en tête du fichier de test.

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `node --test test/hours.test.js`
Expected: FAIL — `dayLabel is not a function` (l'import est `undefined`).

- [ ] **Step 3: Déplacer la fonction**

Dans `js/hours.js`, en fin de fichier :

```js
/**
 * Libellé calendaire d'une journée.
 *
 * La date météo est déjà locale au lieu consulté ; midi évite que la conversion
 * d'un ISO sans fuseau ne bascule au jour voisin.
 *
 * @param {string} date date ISO courte, locale au lieu
 * @param {boolean} isToday
 */
export function dayLabel(date, isToday) {
  if (isToday) return 'Aujourd’hui';

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00`));
}
```

Dans `js/mobile.js` : supprimer la fonction locale `dayLabel` et son commentaire, et l'ajouter à l'import existant :

```js
import { dayLabel, placeDate } from './hours.js';
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS. `test/mobile.test.js` passe **sans avoir été touché** — c'est ce qui prouve que le déplacement n'a rien changé aux libellés de l'accueil.

- [ ] **Step 5: Commit**

```bash
git add js/hours.js js/mobile.js test/hours.test.js
git commit -m "refactor: ranger le libelle des journees avec les dates du lieu"
```

---

### Task 3: `buildTrip` — découper le séjour en journées

**Files:**
- Create: `js/packing.js`
- Test: `test/packing.test.js`

**Interfaces:**
- Consumes: `dayLabel`, `placeDate` de `js/hours.js` ; `buildOutfit` de `js/rules.js` ; `describeDay` de `js/phrasing.js`.
- Produces: `buildTrip(trip, forecasts, at = new Date(), profile = null) => Packing`. Cette tâche ne remplit que `trip`, `days` et `horizon` ; `wear`, `carry` et `notes` sont des tableaux vides jusqu'aux tâches 4 et 5.
  - `trip` : `{ id, start, end, stops: [{ place, from }], packed }`, rendu verbatim.
  - `days` : `[{ id, label, place, weather, outfit, phrasing }]`, du plus proche au plus lointain.
  - `horizon` : `{ covered: string[], missing: string[] }`, des dates ISO.
  - `forecasts` : tableau parallèle à `trip.stops`, chaque entrée étant un tableau de `DayWeather` (celui que rend `fetchForecast`). Une étape dont la requête a échoué passe `[]`.
  - `isTrip(trip: unknown) => boolean` — la garde du contrat, dans le module pur pour être testable sous Node. `apps/mobile` n'a aucun banc de test, et la validation est une règle du domaine, pas du stockage.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `test/packing.test.js` :

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTrip } from '../js/packing.js';

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
```

Ajouter `isTrip` à l'import en tête du fichier de test.

**Trois tests de plus, ajoutés après relecture** — ils gardent l'invariant que le tri de `legsOf`
prétendait tenir. Voir `test/packing.test.js` pour leur forme exacte :

- des étapes données dans le désordre sont rejetées par `isTrip` ;
- deux étapes partageant la même date `from` sont rejetées par `isTrip` ;
- `buildTrip` garde chaque ville appariée à *sa* prévision même quand les étapes arrivent dans le
  désordre — le test qui aurait attrapé le défaut, avec une météo distincte par ville (Porto au
  pull, Lisbonne au short) pour que l'inversion se voie dans la tenue.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `node --test test/packing.test.js`
Expected: FAIL — `Cannot find module '../js/packing.js'`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `js/packing.js` :

```js
/**
 * Agrégation : un voyage et ses prévisions → une valise.
 *
 * Module pur. Il n'appelle ni le réseau, ni le DOM, ni l'horloge : l'instant
 * courant arrive en paramètre, comme partout ailleurs dans le moteur.
 *
 * Le principe tient en une phrase : `buildOutfit()` tourne sur chacune des N
 * journées du séjour, puis les tenues obtenues sont réunies par racine de
 * vêtement. Aucune règle d'habillage n'est réécrite ici — une valise est une
 * union de tenues, pas un second barème.
 *
 * Aucune phrase n'en sort : `phrasing.js` s'en charge, à partir des dates et des
 * quantités que ce module produit.
 */

import { dayLabel, placeDate } from './hours.js';
import { describeDay } from './phrasing.js';
import { buildOutfit } from './rules.js';

/**
 * Un voyage est-il encore lisible ?
 *
 * La garde vit ici, avec le contrat, et non dans le stockage de l'app : c'est
 * une règle du domaine, et c'est le seul endroit où elle peut être testée sous
 * Node. Un voyage écarté vaut mieux qu'un écran qui n'ouvre plus.
 *
 * L'ordre chronologique des étapes fait partie de ce contrat, pas seulement la
 * date de la première : `legsOf` accouple chaque étape à sa prévision avant de
 * trier, justement pour qu'un tri ne puisse jamais faire office de validation.
 * Sans cette exigence ici, une étape reculée ou redondante resterait
 * représentable, et se ferait réinterpréter en silence plus loin.
 *
 * @param {unknown} trip
 * @returns {boolean}
 */
export function isTrip(trip) {
  if (!trip || typeof trip !== 'object') return false;

  const { id, start, end, stops } = trip;
  if (!id || !start || !end) return false;
  if (!Array.isArray(stops) || stops.length === 0) return false;

  // La première étape commence au départ, sans quoi le premier jour du séjour
  // n'aurait aucune ville à laquelle se rattacher.
  if (stops[0].from !== start) return false;

  // Chaque étape suivante doit avancer dans le temps : une date répétée ou
  // reculée ne décrit aucun voyage réel, et ce n'est pas à un tri de deviner
  // l'ordre qu'on a voulu dire.
  const inOrder = stops.every((stop, index) => index === 0 || stop.from > stops[index - 1].from);
  if (!inOrder) return false;

  return stops.every(
    (stop) =>
      typeof stop?.from === 'string' &&
      Number.isFinite(stop.place?.latitude) &&
      Number.isFinite(stop.place?.longitude),
  );
}

/** Le lendemain d'une date ISO courte. Midi, pour ne pas glisser d'un jour. */
function nextDate(date) {
  const t = new Date(`${date}T12:00:00Z`).getTime() + 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Les dates de `from` à `to`, bornes incluses. */
function datesBetween(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = nextDate(date)) dates.push(date);
  return dates;
}

/**
 * Les étapes avec leurs bornes et leur prévision, déduites de la seule chose
 * que le voyage connaisse : le jour où l'on arrive dans chaque ville.
 *
 * Une étape court jusqu'à la veille de la suivante, la dernière jusqu'au retour.
 * C'est ce qui rend les trous et les chevauchements inexprimables : il n'y a
 * qu'une date par étape, donc rien à faire concorder.
 *
 * `forecasts` est accouplé à chaque étape *avant* le tri, par leur position
 * commune dans `trip.stops` telle que donnée. `isTrip` garantit déjà l'ordre
 * chronologique ; le tri qui suit n'est donc plus qu'une normalisation
 * défensive, jamais le moyen par lequel une étape trouve sa prévision — sans
 * quoi une étape mal ordonnée referait correspondre le mauvais accouplement
 * en silence.
 */
function legsOf(trip, forecasts) {
  const pairs = (trip.stops ?? []).map((stop, index) => ({
    stop,
    forecast: forecasts[index] ?? [],
  }));
  pairs.sort((a, b) => (a.stop.from < b.stop.from ? -1 : a.stop.from > b.stop.from ? 1 : 0));

  return pairs.map(({ stop, forecast }, index) => ({
    place: stop.place,
    from: stop.from,
    to: index + 1 < pairs.length ? previousDate(pairs[index + 1].stop.from) : trip.end,
    forecast,
  }));
}

/** La veille d'une date ISO courte. */
function previousDate(date) {
  const t = new Date(`${date}T12:00:00Z`).getTime() - 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * @param {object} trip le voyage : { id, start, end, stops, packed }
 * @param {object[][]} forecasts un tableau de DayWeather par étape, dans l'ordre
 *   des étapes. Une étape dont la requête a échoué passe un tableau vide.
 * @param {Date} at l'instant de consultation
 * @param {string|null} [profile] le vestiaire de qui lit, quand il l'a précisé
 * @returns {object} un Packing
 */
export function buildTrip(trip, forecasts, at = new Date(), profile = null) {
  const days = [];
  const covered = [];
  const missing = [];

  legsOf(trip, forecasts).forEach((leg) => {
    const parDate = new Map(leg.forecast.map((weather) => [weather.date, weather]));

    // « Aujourd'hui » se juge à la date du lieu de l'étape : un séjour à Tokyo
    // n'a pas la même date d'aujourd'hui qu'un téléphone à Paris. On prend le
    // décalage de la prévision quand on l'a, faute de quoi celui du premier
    // jour connu, faute de quoi zéro.
    const offset = leg.forecast[0]?.utcOffsetSeconds ?? 0;
    const aujourdhui = placeDate(at, offset);

    for (const date of datesBetween(leg.from, leg.to)) {
      // Les jours déjà vécus tombent : un séjour commencé ne parle que de ce
      // qui reste. Ils ne comptent pas non plus pour manquants — ils n'ont pas
      // manqué, ils sont passés.
      if (date < aujourdhui) continue;

      const weather = parDate.get(date);
      if (!weather) {
        missing.push(date);
        continue;
      }

      const outfit = buildOutfit(weather, profile);
      covered.push(date);
      days.push({
        id: date,
        label: dayLabel(date, date === aujourdhui),
        place: leg.place,
        weather,
        outfit,
        phrasing: describeDay(weather, outfit, at),
      });
    }
  });

  return {
    trip,
    days,
    wear: [],
    carry: [],
    notes: [],
    horizon: { covered, missing },
  };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `node --test test/packing.test.js`
Expected: PASS — les dix tests de la tâche passent. Ne pas se fier à ce compte : compter les blocs
`test(` du bloc de code ci-dessus, qui fait foi.

- [ ] **Step 5: Commit**

```bash
git add js/packing.js test/packing.test.js
git commit -m "feat: decouper un sejour en journees, ville par ville"
```

---

### Task 4: les quantités — union par racine et barème de renouvellement

**Files:**
- Modify: `js/packing.js`
- Test: `test/packing.test.js`

**Interfaces:**
- Consumes: `garmentRoot` de `js/rules.js` ; le `days` construit en tâche 3.
- Produces: `Packing.wear` et `Packing.carry` remplis.
  - `wear: [{ key, count, pieces: [{ name, count }], days: string[], capped: boolean }]`
  - `carry: [{ key, days: string[] }]`
  - `key` est la racine du vêtement (`garmentRoot`), **sauf la couche extérieure dont la clé est `'couche'`** : c'est un seul crochet, et la pièce qui y pend peut changer d'un rafraîchissement à l'autre.
  - Ordre de `wear` : les racines du haut dans l'ordre où on les enfile, puis le bas, puis la couche. Concrètement, l'ordre de première apparition dans les tenues.
  - `quantityFor(key: string, dayCount: number) => { count, capped }` est **exportée**, pour que la classe d'une racine soit testable : le repli sur la classe relais ne peut pas être atteint par une vraie prévision.

Ajouter `quantityFor` à l'import en tête de `test/packing.test.js`.

- [ ] **Step 1: Écrire les tests qui échouent**

À la suite dans `test/packing.test.js` :

```js
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
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `node --test test/packing.test.js`
Expected: FAIL — `wear` est vide, `ligne()` rend `undefined`, `Cannot read properties of undefined (reading 'count')`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `js/packing.js`, ajouter `garmentRoot` à l'import de `rules.js`, puis les constantes et fonctions suivantes avant `buildTrip` :

```js
/**
 * Tous les combien on renouvelle une pièce, en jours de port.
 *
 * Les pièces portées à même la peau se changent chaque jour ; les autres
 * repartent pour deux ou trois jours. Ce n'est pas de la météo, c'est de
 * l'usage — d'où une table plutôt qu'une règle dans `rules.js`.
 */
const PERIODS = {
  't-shirt': 1,
  'sous-couche': 1,
  chemise: 3,
  pull: 3,
  short: 4,
  pantalon: 4,
  jean: 4,
};

/**
 * La période d'une racine que la table ne connaît pas — un palier ajouté plus
 * tard, un mot changé dans `rules.js`. Trois jours est le moins faux des
 * défauts : une pièce de trop vaut mieux qu'une pièce oubliée.
 */
const FALLBACK_PERIOD = 3;

/** Au-delà, on lave. Le plafond ne vaut que pour les pièces de peau. */
const DAILY_CAP = 7;

/**
 * La clé de la couche extérieure, et pourquoi ce n'est pas une racine.
 *
 * On n'emporte qu'une couche, toutes racines confondues. Si la clé était sa
 * racine, la prévision qui se précise ferait passer d'`imperméable` à
 * `manteau`, la clé changerait, et la coche tomberait — exactement ce que la
 * racine devait empêcher. Un seul crochet, quelle que soit la pièce qui y pend.
 */
const OUTER_KEY = 'couche';

/**
 * Les couches extérieures, de la plus couvrante à la moins.
 *
 * Le seul endroit du module où la couverture se lit dans une table : ces quatre
 * valeurs sont fixées par `rules.js` et ne se déduisent pas des températures —
 * un coupe-vent sort par 12 °C venteux, une veste par 6 °C calmes, et c'est
 * pourtant la veste qui tient le moins la pluie.
 */
const OUTER_ORDER = ['manteau', 'imperméable', 'coupe-vent', 'veste'];

/**
 * Les pièces d'une tenue, avec leur clé de regroupement.
 *
 * On garde le `dressedFor` de la journée : c'est lui qui dira, plus bas, lequel
 * de deux poids est le plus couvrant, sans table de noms à maintenir.
 */
function piecesOf(outfit) {
  const { top, bottom, outer } = outfit.layers;
  const portees = [...top, bottom].filter(Boolean).map((name) => ({
    key: garmentRoot(name),
    name,
  }));

  return outer ? [...portees, { key: OUTER_KEY, name: outer }] : portees;
}

/**
 * Combien d'exemplaires pour une racine, d'après les jours qui la réclament.
 *
 * Exportée pour être testée : la classe d'une racine est une décision d'usage,
 * et le repli sur la classe relais ne peut pas être atteint par une vraie
 * prévision — toutes les racines que `rules.js` produit sont dans la table.
 *
 * @returns {{count: number, capped: boolean}}
 */
export function quantityFor(key, dayCount) {
  if (key === OUTER_KEY) return { count: 1, capped: false };

  const period = PERIODS[key] ?? FALLBACK_PERIOD;
  const brut = Math.ceil(dayCount / period);
  const plafonne = period === 1 && brut > DAILY_CAP;

  return { count: plafonne ? DAILY_CAP : brut, capped: plafonne };
}

/**
 * Les poids d'une racine, du plus couvrant au moins couvrant.
 *
 * Pour la couche extérieure, l'ordre est fixé (voir `OUTER_ORDER`). Pour le
 * reste, il se déduit des données : le poids demandé par la journée la plus
 * froide est le plus couvrant. Une table de noms complets aurait dû lister
 * « pull épais », « chemise légère », « pantalon léger ou jupe » et tout ce
 * qu'un futur palier ajoutera ; elle aurait pourri au premier mot changé.
 */
function byCoverage(key, variants) {
  if (key === OUTER_KEY) {
    return [...variants].sort(
      (a, b) => rankOf(a.name) - rankOf(b.name),
    );
  }

  return [...variants].sort((a, b) => a.coldest - b.coldest);
}

function rankOf(name) {
  const rang = OUTER_ORDER.indexOf(name);
  // Une couche inconnue de la table passe après celles qu'on connaît, plutôt
  // que de prendre la première place par accident.
  return rang === -1 ? OUTER_ORDER.length : rang;
}

/**
 * Nommer les exemplaires, du plus couvrant au moins couvrant.
 *
 * Un exemplaire, deux poids demandés : le plus épais l'emporte, car il couvre
 * la journée qui voulait le plus fin — l'inverse est faux. Deux exemplaires :
 * on prend les deux poids, et un séjour à grand écart reçoit naturellement son
 * pull fin et son pull épais, sans seuil réglé à l'œil. Les exemplaires en trop
 * répètent le plus couvrant.
 */
function namePieces(variants, count) {
  const pieces = new Map();

  for (let i = 0; i < count; i++) {
    const nom = (variants[i] ?? variants[0]).name;
    pieces.set(nom, (pieces.get(nom) ?? 0) + 1);
  }

  return [...pieces].map(([name, exemplaires]) => ({ name, count: exemplaires }));
}

/**
 * L'union des tenues : ce qu'on porte, et ce qu'on emporte.
 *
 * @param {object[]} days les journées produites par buildTrip
 * @returns {{wear: object[], carry: object[]}}
 */
function packItems(days) {
  const portes = new Map();
  const emportes = new Map();

  for (const jour of days) {
    for (const piece of piecesOf(jour.outfit)) {
      if (!portes.has(piece.key)) {
        portes.set(piece.key, { key: piece.key, days: [], variants: new Map() });
      }

      const groupe = portes.get(piece.key);
      groupe.days.push(jour.id);

      const variante = groupe.variants.get(piece.name) ?? {
        name: piece.name,
        coldest: Infinity,
      };
      variante.coldest = Math.min(variante.coldest, jour.outfit.dressedFor);
      groupe.variants.set(piece.name, variante);
    }

    for (const accessoire of jour.outfit.accessories) {
      if (!emportes.has(accessoire)) emportes.set(accessoire, { key: accessoire, days: [] });
      emportes.get(accessoire).days.push(jour.id);
    }
  }

  const wear = [...portes.values()].map((groupe) => {
    const { count, capped } = quantityFor(groupe.key, groupe.days.length);
    const variants = byCoverage(groupe.key, [...groupe.variants.values()]);

    return {
      key: groupe.key,
      count,
      pieces: namePieces(variants, count),
      days: groupe.days,
      capped,
    };
  });

  return { wear, carry: [...emportes.values()] };
}
```

Puis, dans `buildTrip`, remplacer le `return` :

```js
  const { wear, carry } = packItems(days);

  return {
    trip,
    days,
    wear,
    carry,
    notes: [],
    horizon: { covered, missing },
  };
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS. Les tests de la tâche 3 restent verts : `wear` était vide, il est maintenant rempli, et aucun test de la tâche 3 n'affirmait qu'il resterait vide — sauf le voyage sans étape, dont `days` est vide, donc `wear` aussi.

- [ ] **Step 5: Commit**

```bash
git add js/packing.js test/packing.test.js
git commit -m "feat: unir les tenues du sejour en une liste avec ses quantites"
```

---

### Task 5: les deux poids, et les risques groupés

**Files:**
- Modify: `js/packing.js`
- Test: `test/packing.test.js`

**Interfaces:**
- Consumes: `packItems` de la tâche 4.
- Produces: `Packing.notes` rempli — `[{ kind, label, text, severity, days: string[] }]`, une entrée par `kind` d'alerte, le `text` et la `severity` venant du jour le plus sévère. Ordre : la plus sévère d'abord.

- [ ] **Step 1: Écrire les tests qui échouent**

À la suite dans `test/packing.test.js` :

```js
/* --------------------------------------------------------- les deux poids */

test('un seul exemplaire pour deux poids : le plus épais l’emporte', () => {
  // Un pull épais couvre la journée qui voulait un pull fin. L'inverse est faux.
  const { trip, forecasts } = sejour([12, 2]);
  const pull = ligne(buildTrip(trip, forecasts, MORNING), 'pull');

  assert.equal(pull.count, 1);
  assert.deepEqual(pull.pieces, [{ name: 'pull épais', count: 1 }]);
});

test('deux exemplaires pour deux poids : on prend les deux', () => {
  const { trip, forecasts } = sejour([12, 12, 12, 2, 2, 2]);
  const pull = ligne(buildTrip(trip, forecasts, MORNING), 'pull');

  assert.equal(pull.count, 2);
  assert.deepEqual(pull.pieces, [
    { name: 'pull épais', count: 1 },
    { name: 'pull fin', count: 1 },
  ]);
});

test('les exemplaires en trop répètent le plus couvrant', () => {
  const { trip, forecasts } = sejour([12, 12, 12, 12, 2, 2, 2, 2, 2]);
  const pull = ligne(buildTrip(trip, forecasts, MORNING), 'pull');

  assert.equal(pull.count, 3);
  assert.deepEqual(pull.pieces, [
    { name: 'pull épais', count: 2 },
    { name: 'pull fin', count: 1 },
  ]);
});

test('un seul poids demandé reste une seule pièce nommée', () => {
  const { trip, forecasts } = sejour([22, 22, 22]);

  assert.deepEqual(ligne(buildTrip(trip, forecasts, MORNING), 't-shirt').pieces, [
    { name: 't-shirt', count: 3 },
  ]);
});

/* ------------------------------------------------------- les risques groupés */

test('trois jours de pluie font une note, pas trois', () => {
  const pluvieux = { precipitationProbability: 80, precipitationMm: 4, weatherCode: 61 };
  const { trip, forecasts } = sejour([16, 16, 16], { 0: pluvieux, 2: pluvieux });
  const valise = buildTrip(trip, forecasts, MORNING);

  const pluie = valise.notes.filter((n) => n.kind === 'rain');
  assert.equal(pluie.length, 1);
  assert.deepEqual(pluie[0].days, ['2026-09-02', '2026-09-04']);
  assert.equal(pluie[0].label, 'Pluie');
});

test('le texte d’un risque est celui du jour le plus sévère', () => {
  // On fait sa valise pour le pire jour, pas pour le jour médian.
  const bruine = { precipitationProbability: 45, precipitationMm: 0.5, weatherCode: 61 };
  const deluge = { precipitationProbability: 95, precipitationMm: 12, weatherCode: 61 };
  const { trip, forecasts } = sejour([16, 16], { 0: bruine, 1: deluge });
  const valise = buildTrip(trip, forecasts, MORNING);

  const pluie = valise.notes.find((n) => n.kind === 'rain');
  assert.equal(pluie.severity, 'high');
  assert.match(pluie.text, /va bien pleuvoir/);
});

test('les risques les plus sévères passent devant', () => {
  const orageux = {
    precipitationProbability: 95,
    precipitationMm: 12,
    weatherCode: 61,
    windGustsKmh: 45,
  };
  const { trip, forecasts } = sejour([16, 16], { 0: orageux, 1: orageux });
  const valise = buildTrip(trip, forecasts, MORNING);

  assert.equal(valise.notes[0].severity, 'high');
  assert.equal(valise.notes[0].kind, 'rain');
});

test('un séjour sans risque n’invente pas de note', () => {
  const { trip, forecasts } = sejour([22, 22]);

  assert.deepEqual(buildTrip(trip, forecasts, MORNING).notes, []);
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `node --test test/packing.test.js`
Expected: FAIL. Les tests de poids passent déjà — c'est voulu, la tâche 4 a implémenté `namePieces` ; ils sont ici pour verrouiller la règle. Les quatre tests de risques échouent : `notes` est vide.

Si un test de poids échoue, ne pas toucher aux notes : corriger `namePieces` ou `byCoverage` d'abord.

- [ ] **Step 3: Écrire l'implémentation**

Dans `js/packing.js`, ajouter avant `buildTrip` :

```js
/** Ordre d'affichage des risques, comme dans `phrasing.js`. */
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Les risques du séjour, un par sorte.
 *
 * Cinq notes de pluie pour cinq jours de pluie sont illisibles : on garde une
 * note par sorte, avec la liste des jours concernés. Le texte retenu est celui
 * du jour le plus sévère — on fait sa valise pour le pire jour, pas pour le
 * jour médian.
 *
 * Les horaires disparaissent. « Vers 14 h » a un sens le matin même ; sur une
 * liste faite trois jours plus tôt, c'est la date qui compte.
 */
function packNotes(days) {
  const parSorte = new Map();

  for (const jour of days) {
    for (const alert of jour.outfit.alerts) {
      const existante = parSorte.get(alert.kind);

      if (!existante) {
        parSorte.set(alert.kind, {
          kind: alert.kind,
          label: alert.label,
          text: alert.hint,
          severity: alert.severity,
          days: [jour.id],
        });
        continue;
      }

      existante.days.push(jour.id);

      if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[existante.severity]) {
        // Le pire jour donne le ton, et son libellé : « Neige » et « Pluie »
        // partagent la sorte `rain`, et c'est le moteur qui les distingue.
        existante.severity = alert.severity;
        existante.text = alert.hint;
        existante.label = alert.label;
      }
    }
  }

  return [...parSorte.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}
```

Puis dans `buildTrip`, remplacer `notes: []` par `notes: packNotes(days)`.

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/packing.js test/packing.test.js
git commit -m "feat: grouper les risques du sejour sur le pire de ses jours"
```

---

### Task 6: les coches — `applyPacked` et `prunePacked`

**Files:**
- Modify: `js/packing.js`
- Test: `test/packing.test.js`

**Interfaces:**
- Consumes: un `Packing` de la tâche 5, et `trip.packed` (un tableau de clés).
- Produces:
  - `applyPacked(packing, packed) => Packing` — le même objet, chaque entrée de `wear` et de `carry` portant `packed: boolean`, plus `progress: { done: number, total: number }` à la racine.
  - `prunePacked(packing, packed) => string[]` — les clés encore utiles, dans l'ordre de `packed`.

- [ ] **Step 1: Écrire les tests qui échouent**

À la suite dans `test/packing.test.js`, et ajouter `applyPacked, prunePacked` à l'import en tête :

```js
/* ------------------------------------------------------------- les coches */

test('une coche survit au pull fin qui devient un pull épais', () => {
  // La veille du départ, la météo se précise. La clé est la racine, donc le
  // crochet du placard est le même, donc la coche reste.
  const doux = sejour([12, 12]);
  const froid = sejour([2, 2]);

  const avant = applyPacked(buildTrip(doux.trip, doux.forecasts, MORNING), ['pull']);
  const apres = applyPacked(buildTrip(froid.trip, froid.forecasts, MORNING), ['pull']);

  assert.equal(ligne(avant, 'pull').pieces[0].name, 'pull fin');
  assert.equal(ligne(apres, 'pull').pieces[0].name, 'pull épais');
  assert.equal(ligne(avant, 'pull').packed, true);
  assert.equal(ligne(apres, 'pull').packed, true, 'le même crochet, la même coche');
});

test('une coche survit à l’imperméable qui devient un manteau', () => {
  const pluvieux = { precipitationProbability: 80, precipitationMm: 4, weatherCode: 61 };
  const doux = sejour([18], { 0: pluvieux });
  const glacial = sejour([-2], { 0: pluvieux });

  const avant = applyPacked(buildTrip(doux.trip, doux.forecasts, MORNING), ['couche']);
  const apres = applyPacked(buildTrip(glacial.trip, glacial.forecasts, MORNING), ['couche']);

  assert.equal(ligne(avant, 'couche').pieces[0].name, 'imperméable');
  assert.equal(ligne(apres, 'couche').pieces[0].name, 'manteau');
  assert.equal(ligne(apres, 'couche').packed, true);
});

test('ce qu’on emporte se coche aussi', () => {
  const pluvieux = { precipitationProbability: 80, precipitationMm: 4, weatherCode: 61 };
  const { trip, forecasts } = sejour([16], { 0: pluvieux });
  const valise = applyPacked(buildTrip(trip, forecasts, MORNING), ['parapluie']);

  assert.equal(valise.carry.find((i) => i.key === 'parapluie').packed, true);
});

test('l’avancement compte les lignes, portées et emportées', () => {
  const pluvieux = { precipitationProbability: 80, precipitationMm: 4, weatherCode: 61 };
  const { trip, forecasts } = sejour([16, 16], { 0: pluvieux });
  const valise = applyPacked(buildTrip(trip, forecasts, MORNING), ['t-shirt', 'parapluie']);

  assert.equal(valise.progress.done, 2);
  assert.equal(
    valise.progress.total,
    valise.wear.length + valise.carry.length,
    'toutes les lignes comptent, pas les exemplaires',
  );
});

test('sans coche, rien n’est coché et l’avancement est à zéro', () => {
  const { trip, forecasts } = sejour([22]);
  const valise = applyPacked(buildTrip(trip, forecasts, MORNING), []);

  assert.equal(valise.progress.done, 0);
  assert.equal(valise.wear.every((i) => i.packed === false), true);
});

test('une clé devenue sans objet s’élague', () => {
  // On avait coché un manteau ; le séjour est devenu estival. La clé n'a plus
  // rien à désigner et ne doit pas dormir sur le disque.
  const { trip, forecasts } = sejour([27]);
  const valise = buildTrip(trip, forecasts, MORNING);

  assert.deepEqual(prunePacked(valise, ['couche', 't-shirt']), ['t-shirt']);
});

test('l’élagage garde l’ordre des coches', () => {
  const { trip, forecasts } = sejour([27, 27]);
  const valise = buildTrip(trip, forecasts, MORNING);

  assert.deepEqual(prunePacked(valise, ['short', 't-shirt']), ['short', 't-shirt']);
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `node --test test/packing.test.js`
Expected: FAIL — `applyPacked is not a function`.

- [ ] **Step 3: Écrire l'implémentation**

En fin de `js/packing.js` :

```js
/**
 * Ce qui est déjà dans le sac, posé sur la valise calculée.
 *
 * Hors de `buildTrip` à dessein : le calcul de valise ne sait rien de l'état du
 * sac, et reste donc testable sans coche.
 *
 * La coche porte sur la ligne et non sur l'exemplaire. « 7 t-shirts » se coche
 * une fois : sept gestes pour une ligne feraient de l'app un gestionnaire de
 * tâches, alors que la quantité est une information.
 *
 * @param {object} packing un Packing
 * @param {string[]} packed les clés déjà dans le sac
 */
export function applyPacked(packing, packed) {
  const cochees = new Set(packed);
  const marque = (item) => ({ ...item, packed: cochees.has(item.key) });

  const wear = packing.wear.map(marque);
  const carry = packing.carry.map(marque);
  const lignes = [...wear, ...carry];

  return {
    ...packing,
    wear,
    carry,
    progress: {
      done: lignes.filter((item) => item.packed).length,
      total: lignes.length,
    },
  };
}

/**
 * Les coches qui désignent encore quelque chose.
 *
 * Appelée à l'écriture : une clé devenue sans objet — le manteau d'un séjour
 * devenu estival — s'élague au lieu de dormir sur le disque et de recocher une
 * ligne qui réapparaîtrait des mois plus tard.
 *
 * @returns {string[]} les clés retenues, dans l'ordre reçu
 */
export function prunePacked(packing, packed) {
  const existantes = new Set([
    ...packing.wear.map((item) => item.key),
    ...packing.carry.map((item) => item.key),
  ]);

  return packed.filter((key) => existantes.has(key));
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/packing.js test/packing.test.js
git commit -m "feat: garder la coche quand la prevision change la piece"
```

---

### Task 7: `describePacking` — la mise en mots

**Files:**
- Modify: `js/phrasing.js`
- Test: `test/phrasing.test.js`

**Interfaces:**
- Consumes: un `Packing` de la tâche 6 (avec ou sans `progress`), `dayLabel` de `js/hours.js`.
- Produces: `describePacking(packing) => { title, dates, wear, carry, notes, confidence, horizon }`
  - `title: string` — les villes, sans région ni pays, jointes par ` → `.
  - `dates: string` — `'2 → 4 sept.'`, ou `'30 août → 2 sept.'` à cheval sur deux mois.
  - `wear: [{ key, label, detail, why }]` — `label` : `'2 pulls'` ; `detail` : `'un épais, un fin'` ou `null` ; `why` : la raison, jamais nulle.
  - `carry: [{ key, label, why }]`
  - `notes: [{ label, text, when }]` — `when` : les jours en mots.
  - `confidence: string | null`, `horizon: string | null`.
  - Aucune date ISO ne sort de cette fonction.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `test/phrasing.test.js`, ajouter `describePacking` à l'import et, en fin de fichier :

```js
/* ------------------------------------------------------- la valise en mots */

/** Un Packing minimal, sans passer par buildTrip : on teste les mots ici. */
function valise(overrides = {}) {
  return {
    trip: {
      id: 'trip-1',
      start: '2026-09-02',
      end: '2026-09-04',
      stops: [
        { place: { name: 'Lisbonne, Portugal' }, from: '2026-09-02' },
        { place: { name: 'Porto, Portugal' }, from: '2026-09-04' },
      ],
      packed: [],
    },
    days: [],
    wear: [],
    carry: [],
    notes: [],
    horizon: { covered: ['2026-09-02', '2026-09-03', '2026-09-04'], missing: [] },
    ...overrides,
  };
}

test('le titre enchaîne les villes, sans leur pays', () => {
  const mots = describePacking(valise());

  assert.equal(mots.title, 'Lisbonne → Porto');
  assert.equal(mots.dates, '2 → 4 sept.');
});

test('un séjour à cheval sur deux mois nomme les deux', () => {
  const mots = describePacking(
    valise({ trip: { ...valise().trip, start: '2026-08-30', end: '2026-09-02' } }),
  );

  assert.equal(mots.dates, '30 août → 2 sept.');
});

test('une pièce en plusieurs exemplaires se met au pluriel', () => {
  const mots = describePacking(
    valise({
      wear: [
        {
          key: 't-shirt',
          count: 4,
          pieces: [{ name: 't-shirt léger', count: 4 }],
          days: ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'],
          capped: false,
        },
      ],
    }),
  );

  assert.equal(mots.wear[0].label, '4 t-shirts légers');
  assert.equal(mots.wear[0].detail, null, 'un seul poids ne demande aucun détail');
});

test('deux poids se lisent en une ligne et son détail', () => {
  const mots = describePacking(
    valise({
      wear: [
        {
          key: 'pull',
          count: 2,
          pieces: [
            { name: 'pull épais', count: 1 },
            { name: 'pull fin', count: 1 },
          ],
          days: ['2026-09-02', '2026-09-03'],
          capped: false,
        },
      ],
    }),
  );

  assert.equal(mots.wear[0].label, '2 pulls');
  assert.equal(mots.wear[0].detail, 'un épais, un fin');
});

test('le plafond dit pourquoi il plafonne', () => {
  const dix = Array.from({ length: 10 }, (_, i) => `2026-09-${String(2 + i).padStart(2, '0')}`);
  const mots = describePacking(
    valise({
      wear: [
        { key: 't-shirt', count: 7, pieces: [{ name: 't-shirt', count: 7 }], days: dix, capped: true },
      ],
    }),
  );

  assert.equal(mots.wear[0].label, '7 t-shirts');
  assert.match(mots.wear[0].why, /laveras/);
});

test('la raison d’une ligne nomme ses jours, et dit « tous les jours » quand c’est le cas', () => {
  const tous = ['2026-09-02', '2026-09-03', '2026-09-04'];
  const mots = describePacking(
    valise({
      wear: [
        { key: 't-shirt', count: 3, pieces: [{ name: 't-shirt', count: 3 }], days: tous, capped: false },
        { key: 'pull', count: 1, pieces: [{ name: 'pull', count: 1 }], days: ['2026-09-03'], capped: false },
      ],
    }),
  );

  assert.equal(mots.wear[0].why, 'tous les jours');
  assert.equal(mots.wear[1].why, 'jeu. 3 sept.');
});

test('ce qu’on emporte prend son article', () => {
  const mots = describePacking(
    valise({ carry: [{ key: 'parapluie', days: ['2026-09-03'] }] }),
  );

  assert.equal(mots.carry[0].label, 'un parapluie');
  assert.equal(mots.carry[0].why, 'jeu. 3 sept.');
});

test('un risque porte ses jours, pas ses heures', () => {
  const mots = describePacking(
    valise({
      notes: [
        {
          kind: 'rain',
          label: 'Pluie',
          text: 'Il va bien pleuvoir.',
          severity: 'high',
          days: ['2026-09-02', '2026-09-04'],
        },
      ],
    }),
  );

  assert.equal(mots.notes[0].label, 'Pluie');
  assert.equal(mots.notes[0].when, 'mer. 2 sept. et ven. 4 sept.');
});

test('la ligne de confiance apparaît dès qu’un jour tombe sous trois modèles', () => {
  const mots = describePacking(
    valise({
      days: [
        { id: '2026-09-02', weather: { modelCount: 5 } },
        { id: '2026-09-03', weather: { modelCount: 2 } },
        { id: '2026-09-04', weather: { modelCount: 2 } },
      ],
    }),
  );

  assert.match(mots.confidence, /2 centres de prévision sur 5/);
  assert.match(mots.confidence, /jeu\. 3 sept\./, 'on dit à partir de quand');
});

test('la confiance se tait quand tous les modèles répondent', () => {
  const mots = describePacking(
    valise({ days: [{ id: '2026-09-02', weather: { modelCount: 5 } }] }),
  );

  assert.equal(mots.confidence, null);
});

test('les jours hors fenêtre se disent, et se taisent quand il n’y en a pas', () => {
  const avec = describePacking(
    valise({ horizon: { covered: ['2026-09-02'], missing: ['2026-09-03', '2026-09-04'] } }),
  );
  const unSeul = describePacking(
    valise({ horizon: { covered: ['2026-09-02'], missing: ['2026-09-03'] } }),
  );

  assert.match(avec.horizon, /2 derniers jours/);
  assert.match(unSeul.horizon, /Le dernier jour/, 'un jour manquant ne se dit pas au pluriel');
  assert.equal(describePacking(valise()).horizon, null);
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `node --test test/phrasing.test.js`
Expected: FAIL — `describePacking is not a function`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `js/phrasing.js`, ajouter `dayLabel` à l'import de `./hours.js`, puis en fin de fichier :

```js
/* -------------------------------------------------------------- la valise */

/** Mots des petits nombres, pour les détails de poids. */
const EXEMPLAIRES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept'];

/**
 * Les mots qui ne prennent pas la marque du pluriel dans un nom de vêtement.
 *
 * « pantalon léger ou jupe » donne « pantalons légers ou jupes » : la
 * conjonction reste, tout le reste s'accorde. Une table de noms complets aurait
 * pourri au premier palier ajouté dans `rules.js`.
 */
const INVARIABLES = new Set(['ou', 'et', 'de', 'à', 'la', 'le']);

/** Le pluriel d'un nom de vêtement, mot à mot. */
function pluralOf(name) {
  return name
    .split(' ')
    .map((mot) => {
      if (INVARIABLES.has(mot)) return mot;
      return /[sx]$/.test(mot) ? mot : `${mot}s`;
    })
    .join(' ');
}

/** Le qualificatif d'un poids : « pull épais » sous la racine « pull » → « épais ». */
function qualifierOf(name, key) {
  const reste = name.startsWith(key) ? name.slice(key.length).trim() : '';
  return reste || name;
}

/** Les jours d'une ligne, en mots. */
function whenDays(dates, total) {
  if (dates.length === 0) return 'aucun jour';
  if (total > 0 && dates.length >= total) return 'tous les jours';

  return enumerate(dates.map((date) => dayLabel(date, false)));
}

/** « 2 → 4 sept. », ou « 30 août → 2 sept. » à cheval sur deux mois. */
function phraseDates(start, end) {
  const jourEtMois = (date) =>
    new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
      new Date(`${date}T12:00:00`),
    );
  const mois = (date) => jourEtMois(date).split(' ').slice(1).join(' ');
  const jour = (date) => jourEtMois(date).split(' ')[0];

  return mois(start) === mois(end)
    ? `${jour(start)} → ${jourEtMois(end)}`
    : `${jourEtMois(start)} → ${jourEtMois(end)}`;
}

/** Au-dessous de ce nombre de modèles, la prévision ne se mesure plus vraiment. */
const THIN_ENSEMBLE = 3;

/** Le nombre de centres interrogés, pour le dire en toutes lettres. */
const CENTRES = 5;

/**
 * Ce que la valise ne peut pas promettre.
 *
 * Au-delà du septième jour, Météo-France et l'ICON ont cessé de publier : il ne
 * reste qu'ECMWF et GFS, puis GFS seul. L'écart entre deux modèles ressemble à
 * l'écart entre cinq, en plus petit — et taire cette différence rendrait l'app
 * la plus sûre d'elle là où elle en sait le moins.
 */
function ensembleWarning(days) {
  const maigre = days.find((jour) => (jour.weather?.modelCount ?? CENTRES) < THIN_ENSEMBLE);
  if (!maigre) return null;

  const combien = maigre.weather.modelCount;
  return `À partir du ${dayLabel(maigre.id, false)}, ${combien} centre${combien > 1 ? 's' : ''} de prévision sur ${CENTRES} répond${combien > 1 ? 'ent' : ''} encore — la liste peut bouger.`;
}

/** Les jours du séjour que la prévision n'atteint pas encore. */
function horizonWarning(missing) {
  if (missing.length === 0) return null;

  if (missing.length === 1) {
    return 'Le dernier jour est trop loin : la météo n’existe pas encore pour lui.';
  }

  return `Les ${missing.length} derniers jours sont trop loin : la météo n’existe pas encore pour eux.`;
}

/**
 * La valise en mots.
 *
 * Aucune date ISO n'en sort : l'écran n'a plus rien à formater, et la mise en
 * mots ne vit qu'à un seul endroit.
 *
 * @param {object} packing un Packing produit par `js/packing.js`
 */
export function describePacking(packing) {
  const total = packing.horizon.covered.length;

  return {
    title: enumerateStops(packing.trip.stops),
    dates: phraseDates(packing.trip.start, packing.trip.end),
    wear: packing.wear.map((item) => {
      const unSeulPoids = item.pieces.length === 1;
      const piece = item.pieces[0];

      return {
        key: item.key,
        label: unSeulPoids
          ? `${item.count} ${item.count > 1 ? pluralOf(piece.name) : piece.name}`
          : `${item.count} ${pluralOf(item.key)}`,
        detail: unSeulPoids
          ? null
          : item.pieces
              .map((p) => `${EXEMPLAIRES[p.count] ?? p.count} ${qualifierOf(p.name, item.key)}`)
              .join(', '),
        why: item.capped
          ? `${whenDays(item.days, total)} — au-delà, tu laveras`
          : whenDays(item.days, total),
      };
    }),
    carry: packing.carry.map((item) => ({
      key: item.key,
      label: ARTICLES[item.key] ?? item.key,
      why: whenDays(item.days, total),
    })),
    notes: packing.notes.map((note) => ({
      label: note.label,
      text: note.text,
      when: whenDays(note.days, total),
    })),
    confidence: ensembleWarning(packing.days),
    horizon: horizonWarning(packing.horizon.missing),
  };
}

/** Les villes du séjour, sans région ni pays — elles ne tiennent pas en titre. */
function enumerateStops(stops) {
  return (stops ?? [])
    .map((stop) => stop.place.name.split(',')[0].trim())
    .join(' → ');
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/phrasing.js test/phrasing.test.js
git commit -m "feat: mettre la valise en mots, du pluriel jusqu'au plafond"
```

---

### Task 8: le contrat TypeScript et le stockage du voyage

**Files:**
- Modify: `apps/mobile/src/lib/types.ts`
- Create: `apps/mobile/src/core/packing.ts`
- Modify: `apps/mobile/src/lib/storage.native.ts`
- Modify: `apps/mobile/src/lib/storage.web.ts`

**Interfaces:**
- Consumes: `buildTrip`, `applyPacked`, `prunePacked` de `js/packing.js` ; `describePacking` de `js/phrasing.js`.
- Produces:
  - Types `Trip`, `TripStop`, `TripDay`, `PackItem`, `Packing`, `PackingWords` dans `@/lib/types`.
  - `apps/mobile/src/core/packing.ts` ré-exporte les quatre fonctions, comme `core/weather.ts` le fait déjà pour le moteur météo.
  - `getStoredTrips(): Promise<Trip[]>` et `storeTrips(trips: Trip[]): Promise<void>` dans `@/lib/storage`, sous la clé `quoi-porter.trips`.
  - `getStoredTrips()` **écarte en silence** tout voyage non conforme, en appelant `isTrip` du module pur (tâche 3) — pas une copie locale. Un voyage écrit par une version antérieure ne doit pas empêcher l'écran d'ouvrir.

**Rappel** : lire https://docs.expo.dev/versions/v57.0.0/ avant d'écrire du code Expo. Le stockage natif passe par `expo-sqlite/kv-store`, déjà importé dans `storage.native.ts`.

- [ ] **Step 1: Ajouter les types**

Dans `apps/mobile/src/lib/types.ts`, en fin de fichier :

```ts
/** Une ville du séjour, et le jour où l'on y arrive. */
export type TripStop = {
  place: Place;
  from: string;
};

/**
 * Un voyage : une tranche de temps continue passée dans plusieurs villes.
 *
 * Une étape court de son `from` jusqu'au `from` de la suivante, ou jusqu'à
 * `end`. Les états absurdes — trou entre deux villes, chevauchement — ne sont
 * pas exprimables, donc il n'y a rien à valider.
 */
export type Trip = {
  id: string;
  start: string;
  end: string;
  stops: TripStop[];
  /** Les clés déjà dans le sac. Des racines de vêtement, plus `couche`. */
  packed: string[];
};

/** Une journée du séjour : la forme d'une journée de l'accueil, plus son lieu. */
export type TripDay = Omit<ForecastDay, 'isToday' | 'phrasing'> & {
  place: Place;
  phrasing: Omit<ForecastDay['phrasing'], 'versusYesterday' | 'later'>;
};

/**
 * Une ligne de la valise.
 *
 * `key` est la racine du vêtement — `garmentRoot()` —, sauf la couche
 * extérieure dont la clé est `couche` : c'est un seul crochet du placard, et la
 * pièce qui y pend change quand la prévision se précise.
 */
export type PackItem = {
  key: string;
  count: number;
  pieces: { name: string; count: number }[];
  days: string[];
  capped: boolean;
  /** Posé par `applyPacked`, absent du calcul brut. */
  packed?: boolean;
};

export type Packing = {
  trip: Trip;
  days: TripDay[];
  wear: PackItem[];
  carry: { key: string; days: string[]; packed?: boolean }[];
  notes: { kind: string; label: string; text: string; severity: string; days: string[] }[];
  horizon: { covered: string[]; missing: string[] };
  /** Posé par `applyPacked`. */
  progress?: { done: number; total: number };
};

/** La valise en mots. Aucune date ISO : l'écran ne formate rien. */
export type PackingWords = {
  title: string;
  dates: string;
  wear: { key: string; label: string; detail: string | null; why: string }[];
  carry: { key: string; label: string; why: string }[];
  notes: { label: string; text: string; when: string | null }[];
  confidence: string | null;
  horizon: string | null;
};
```

- [ ] **Step 2: Créer le pont vers le moteur**

Créer `apps/mobile/src/core/packing.ts` :

```ts
// Le moteur de valise reste à la racine du dépôt, où le site web pourra s'en
// servir aussi. Metro surveille déjà le workspace parent (voir metro.config.js).
export { applyPacked, buildTrip, isTrip, prunePacked, quantityFor } from '../../../../js/packing.js';
export { describePacking } from '../../../../js/phrasing.js';
```

- [ ] **Step 3: Ajouter la clé de stockage, des deux côtés**

Dans `apps/mobile/src/lib/storage.native.ts` : ajouter la constante, puis les deux fonctions.

```ts
const TRIPS_KEY = 'quoi-porter.trips';
```

```ts
/**
 * Les voyages gardés sur l'appareil.
 *
 * Un voyage non conforme est écarté en silence : écrit par une version
 * antérieure, ou abîmé, il ne doit pas empêcher l'écran d'ouvrir. On préfère
 * perdre un voyage que l'accès à tous.
 */
export async function getStoredTrips(): Promise<Trip[]> {
  const trips = parse<Trip[]>(await read(TRIPS_KEY));
  return Array.isArray(trips) ? trips.filter((trip) => isTrip(trip)) : [];
}

export function storeTrips(trips: Trip[]) {
  return Storage.setItem(TRIPS_KEY, JSON.stringify(trips));
}
```

La garde `isTrip` **ne se réécrit pas ici** : elle vient du module pur, où elle est testée sous Node (tâche 3). `apps/mobile` n'a aucun banc de test, et une copie de cette règle dériverait de l'original sans que rien ne le montre.

```ts
import { isTrip } from '@/core/packing';
```

Ajouter `isTrip` à la liste des ré-exports de `apps/mobile/src/core/packing.ts` :

```ts
export { applyPacked, buildTrip, isTrip, prunePacked, quantityFor } from '../../../../js/packing.js';
```

`TRIPS_KEY` n'a **pas** d'entrée dans `LEGACY_KEYS` : la fonction est nouvelle, il n'y a aucun ancien nom à relire. Vérifier que `read()` supporte une clé absente de `LEGACY_KEYS` — `Storage.getItem(undefined)` planterait. Corriger `read()` ainsi :

```ts
async function read(key: string): Promise<string | null> {
  const value = await Storage.getItem(key);
  if (value !== null) return value;

  const legacyKey = LEGACY_KEYS[key];
  if (!legacyKey) return null;

  const legacy = await Storage.getItem(legacyKey);
  if (legacy !== null) {
    await Storage.setItem(key, legacy);
    await Storage.removeItem(legacyKey);
  }

  return legacy;
}
```

Reproduire les trois blocs dans `apps/mobile/src/lib/storage.web.ts`, avec sa forme synchrone (`getStorage()?.setItem(...)`, `read()` non asynchrone) et le même garde-fou sur `LEGACY_KEYS`. Ajouter `Trip` aux imports de type des deux fichiers.

- [ ] **Step 4: Vérifier**

Run: `cd apps/mobile && npm run typecheck && npm run lint`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/types.ts apps/mobile/src/core/packing.ts apps/mobile/src/lib/storage.native.ts apps/mobile/src/lib/storage.web.ts
git commit -m "feat: garder les voyages sur l'appareil, et ecarter ceux qu'on ne lit plus"
```

---

# Étape B — l'écran valise

À la fin de l'étape B, on peut choisir un séjour et lire sa valise. Les coches et la bibliothèque viennent après.

### Task 9: `use-trip` — le voyage courant et ses prévisions

**Files:**
- Create: `apps/mobile/src/hooks/use-trip.ts`

**Interfaces:**
- Consumes: `getStoredTrips`, `storeTrips` de `@/lib/storage` ; `fetchForecast` de `@/core/weather` ; `buildTrip`, `applyPacked`, `describePacking` de `@/core/packing` ; `Profile` de `@/lib/types`.
- Produces:
```ts
useTrip(profile: Profile | null): {
  trips: Trip[];
  trip: Trip | null;          // le premier dont la fin n'est pas passée
  packing: Packing | null;    // avec `progress`, via applyPacked
  words: PackingWords | null;
  loading: boolean;
  error: string | null;
  save: (trip: Trip) => Promise<void>;      // crée ou remplace par id, puis recharge
  remove: (id: string) => Promise<void>;
  select: (id: string) => void;             // regarder un autre voyage de la liste
  refresh: () => Promise<void>;
}
```
`toggle` n'existe **pas** encore à la fin de cette tâche : la tâche 13 l'ajoute. Ne pas l'écrire d'avance — la valise se lit avant de se cocher, et l'étape B doit être vérifiable sans elle.
- `daysUntil(date)` : le nombre de jours de aujourd'hui à `date`, borné à 16, minimum 1 — c'est le `forecastDays` à demander.

- [ ] **Step 1: Écrire le hook**

Créer `apps/mobile/src/hooks/use-trip.ts` :

```ts
/**
 * Le voyage courant, sa prévision et sa valise.
 *
 * Une requête par étape : `forecast_days` compte depuis aujourd'hui, donc on
 * demande de aujourd'hui à la fin de l'étape, puis `buildTrip` découpe. Quelques
 * journées de trop dans la réponse ne coûtent rien — le service est gratuit et
 * sans clé — et cela évite une arithmétique de fenêtre en double.
 *
 * Une étape dont la requête échoue passe un tableau vide : la valise se
 * construit sur les autres, et ses jours partent dans `horizon.missing`. Pas
 * d'écran d'erreur pour une ville sur trois.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { applyPacked, buildTrip, describePacking } from '@/core/packing';
import { fetchForecast } from '@/core/weather';
// Metro sélectionne storage.native.ts ou storage.web.ts selon la plateforme.
// eslint-disable-next-line import/no-unresolved
import { getStoredTrips, storeTrips } from '@/lib/storage';
import type { DayWeather, Packing, PackingWords, Profile, Trip } from '@/lib/types';

/** La fenêtre que les modèles couvrent. Au-delà, la météo n'existe pas encore. */
export const HORIZON_DAYS = 16;

/** Aujourd'hui, en date ISO courte, à l'heure de l'appareil. */
function today() {
  const at = new Date();
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Combien de journées demander pour couvrir jusqu'à `date`. */
function daysUntil(date: string) {
  const jours =
    Math.round(
      (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) /
        86400000,
    ) + 1;

  return Math.min(HORIZON_DAYS, Math.max(1, jours));
}

/** La borne de fin d'une étape : la veille de la suivante, ou le retour. */
function legEnd(trip: Trip, index: number) {
  const suivante = trip.stops[index + 1];
  if (!suivante) return trip.end;

  const t = new Date(`${suivante.from}T12:00:00Z`).getTime() - 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function useTrip(profile: Profile | null) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<DayWeather[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Le voyage courant : celui qu'on regarde, sinon le premier dont la fin n'est
  // pas passée. Un séjour terminé n'ouvre pas une valise pour un voyage fini.
  const trip = useMemo(() => {
    if (selectedId) return trips.find((t) => t.id === selectedId) ?? null;

    const jour = today();
    return trips.filter((t) => t.end >= jour).sort((a, b) => (a.start < b.start ? -1 : 1))[0] ?? null;
  }, [trips, selectedId]);

  useEffect(() => {
    let vivant = true;

    getStoredTrips()
      .then((stored) => {
        if (vivant) setTrips(stored);
      })
      .finally(() => {
        if (vivant) setLoading(false);
      });

    return () => {
      vivant = false;
    };
  }, []);

  const load = useCallback(async (cible: Trip | null) => {
    if (!cible) {
      setForecasts([]);
      return;
    }

    setLoading(true);
    setError(null);

    const resultats = await Promise.all(
      cible.stops.map(async (stop, index) => {
        try {
          return (await fetchForecast(
            stop.place.latitude,
            stop.place.longitude,
            daysUntil(legEnd(cible, index)),
            0,
          )) as DayWeather[];
        } catch {
          // Une étape muette n'empêche pas les autres : ses jours iront dans
          // `horizon.missing`, et la ligne le dira.
          return [] as DayWeather[];
        }
      }),
    );

    setForecasts(resultats);
    setLoading(false);

    if (resultats.every((jours) => jours.length === 0)) {
      setError('La météo est indisponible pour le moment. Réessaie dans un instant.');
    }
  }, []);

  useEffect(() => {
    void load(trip);
  }, [load, trip]);

  const packing = useMemo<Packing | null>(() => {
    if (!trip || forecasts.length === 0) return null;

    const brut = buildTrip(trip, forecasts, new Date(), profile) as Packing;
    return applyPacked(brut, trip.packed) as Packing;
  }, [trip, forecasts, profile]);

  const words = useMemo<PackingWords | null>(
    () => (packing ? (describePacking(packing) as PackingWords) : null),
    [packing],
  );

  const save = useCallback(async (next: Trip) => {
    const suivants = [...trips.filter((t) => t.id !== next.id), next];
    setTrips(suivants);
    setSelectedId(next.id);
    await storeTrips(suivants);
  }, [trips]);

  const remove = useCallback(async (id: string) => {
    const suivants = trips.filter((t) => t.id !== id);
    setTrips(suivants);
    if (selectedId === id) setSelectedId(null);
    await storeTrips(suivants);
  }, [trips, selectedId]);

  const refresh = useCallback(() => load(trip), [load, trip]);

  return {
    trips,
    trip,
    packing,
    words,
    loading,
    error,
    save,
    remove,
    select: setSelectedId,
    refresh,
  };
}
```

- [ ] **Step 2: Vérifier**

Run: `cd apps/mobile && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/use-trip.ts
git commit -m "feat: charger la prevision de chaque etape du voyage"
```

---

### Task 10: la grille de seize jours

**Files:**
- Create: `apps/mobile/src/packing/DateGrid.tsx`

**Interfaces:**
- Consumes: `HORIZON_DAYS` de `@/hooks/use-trip`.
- Produces:
```tsx
<DateGrid
  from={string | null}         // l'arrivée déjà choisie
  to={string | null}
  ink={string}
  muted={string}
  surface={string}
  reduced={boolean}
  max={string | undefined}     // borne haute optionnelle, pour choisir un jour d'étape
  min={string | undefined}
  horizonDays={number}         // requis : la fenêtre, passée par l'appelant
  onPick={(date: string) => void}
/>
```
Le composant ne garde aucun état : il affiche une sélection et signale un appui. L'écran décide si l'appui pose l'arrivée ou le départ.

**Pourquoi une grille et non un calendrier** : le choix des dates *est* l'horizon. Une grille des seize jours qui existent enseigne la limite au lieu de l'expliquer, et seize pastilles sont moins de code qu'un sélecteur importé — donc aucune dépendance nouvelle.

- [ ] **Step 1: Écrire le composant**

Créer `apps/mobile/src/packing/DateGrid.tsx` :

```tsx
/**
 * Les seize jours qui existent, en sept colonnes.
 *
 * Le choix des dates est l'horizon : pas de calendrier qui laisse viser dans
 * trois semaines pour s'excuser ensuite. Un séjour se voit comme un bloc
 * contigu, et ce qui n'est pas proposé n'a pas besoin d'être expliqué.
 *
 * La grille commence au lundi de la semaine d'aujourd'hui pour que les colonnes
 * portent un jour de semaine constant ; les cases d'avant aujourd'hui sont
 * vides, non grisées — une case vide ne se touche pas, et ne demande pas
 * pourquoi elle ne se touche pas.
 */

import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/motion/PressableScale';

const COLUMNS = 7;
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function isoOf(at: Date) {
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDays(date: string, n: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Les cases à dessiner : du lundi de la semaine courante jusqu'au seizième jour,
 * complétées jusqu'à la fin de la dernière ligne.
 */
function cellsOf(today: string, horizonDays: number) {
  const jour = new Date(`${today}T12:00:00Z`).getUTCDay();
  const depuisLundi = (jour + 6) % 7;
  const debut = addDays(today, -depuisLundi);
  const fin = addDays(today, horizonDays - 1);

  const cells: string[] = [];
  for (let date = debut; date <= fin; date = addDays(date, 1)) cells.push(date);
  while (cells.length % COLUMNS !== 0) cells.push(addDays(cells[cells.length - 1], 1));

  return { cells, fin };
}

export function DateGrid({
  from,
  to,
  ink,
  muted,
  surface,
  reduced,
  min,
  max,
  horizonDays,
  onPick,
}: {
  from: string | null;
  to: string | null;
  ink: string;
  muted: string;
  surface: string;
  reduced: boolean;
  min?: string;
  max?: string;
  horizonDays: number;
  onPick: (date: string) => void;
}) {
  const today = isoOf(new Date());
  const { cells, fin } = cellsOf(today, horizonDays);
  const bas = min ?? today;
  const haut = max ?? fin;

  return (
    <View>
      <View style={styles.header}>
        {WEEKDAYS.map((lettre, index) => (
          <Text key={`${lettre}-${index}`} style={[styles.weekday, { color: muted }]}>
            {lettre}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date) => {
          const atteignable = date >= bas && date <= haut;
          const dansLeSejour = from && to && date >= from && date <= to;
          const borne = date === from || date === to;

          if (!atteignable) {
            return <View key={date} style={styles.cell} />;
          }

          return (
            <PressableScale
              accessibilityLabel={labelOf(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: Boolean(borne || dansLeSejour) }}
              key={date}
              onPress={() => onPick(date)}
              reduced={reduced}
              scaleTo={0.92}
              style={[
                styles.cell,
                dansLeSejour ? { backgroundColor: surface } : null,
                borne ? { backgroundColor: ink } : null,
              ]}>
              <Text
                style={[
                  styles.day,
                  { color: borne ? surface : ink },
                  date === today ? styles.today : null,
                ]}>
                {Number(date.slice(8))}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** Le libellé lu par VoiceOver : un chiffre seul ne dit pas quel jour. */
function labelOf(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row' },
  weekday: { flexBasis: `${100 / COLUMNS}%`, fontSize: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  // 44 de haut : la cible tactile minimale, sur laquelle la pastille est centrée.
  cell: {
    alignItems: 'center',
    borderRadius: 12,
    flexBasis: `${100 / COLUMNS}%`,
    height: 44,
    justifyContent: 'center',
  },
  day: { fontSize: 16, fontVariant: ['tabular-nums'] },
  today: { fontWeight: '700' },
});
```

- [ ] **Step 2: Vérifier**

Run: `cd apps/mobile && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/packing/DateGrid.tsx
git commit -m "feat: proposer les seize jours qui existent, et rien de plus"
```

---

### Task 11: l'écran valise, et l'entrée depuis l'accueil

**Files:**
- Create: `apps/mobile/src/app/packing.tsx`
- Create: `apps/mobile/src/packing/TripEditor.tsx`
- Modify: `apps/mobile/src/app/index.tsx` (sous `<DayRail …/>`, vers la ligne 440)

**Interfaces:**
- Consumes: `useTrip` (tâche 9), `DateGrid` (tâche 10), `useProfile`, `useSkyMood`, `SkyBackground`, `PressableScale`, `Reveal`, `veilFor`/`luminanceOf` de `@/core/weather`.
- Produces: la route `/packing` ; `TripEditor` qui rend un `Trip` complet via `onDone(trip: Trip)`.

- [ ] **Step 1: Écrire l'éditeur de séjour**

Créer `apps/mobile/src/packing/TripEditor.tsx`. Il tient trois moments dans un seul écran : les dates, la première ville, les étapes suivantes.

```tsx
/**
 * Où l'on va, et quand.
 *
 * Trois choses à dire dans l'ordre où elles se décident : la tranche de dates,
 * la ville de départ, puis les étapes s'il y en a. Chaque étape ne demande
 * qu'un jour d'arrivée — la fin se déduit de la suivante —, ce qui rend les
 * trous et les chevauchements inexprimables.
 */

import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateGrid } from '@/packing/DateGrid';
import { HORIZON_DAYS } from '@/hooks/use-trip';
import { PressableScale } from '@/motion/PressableScale';
import type { Place, Trip, TripStop } from '@/lib/types';

export function TripEditor({
  initial,
  onDone,
  onCancel,
  openPlaceFinder,
  reduced,
}: {
  initial: Trip | null;
  onDone: (trip: Trip) => void;
  onCancel: () => void;
  /** Ouvre la recherche de ville existante et rend le lieu choisi. */
  openPlaceFinder: () => Promise<Place | null>;
  reduced: boolean;
}) {
  const [start, setStart] = useState<string | null>(initial?.start ?? null);
  const [end, setEnd] = useState<string | null>(initial?.end ?? null);
  const [stops, setStops] = useState<TripStop[]>(initial?.stops ?? []);

  /** Un appui pose l'arrivée, le suivant le retour, le troisième recommence. */
  function pickDate(date: string) {
    if (!start || (start && end)) {
      setStart(date);
      setEnd(null);
      // Les étapes tombent : leurs jours ne sont plus dans le séjour.
      setStops(stops.slice(0, 1).map((stop) => ({ ...stop, from: date })));
      return;
    }

    if (date < start) {
      setStart(date);
      setStops(stops.slice(0, 1).map((stop) => ({ ...stop, from: date })));
      return;
    }

    setEnd(date);
  }

  async function addStop(from: string | null) {
    const place = await openPlaceFinder();
    if (!place || !start) return;

    const stop = { place, from: from ?? start };
    setStops(
      [...stops.filter((s) => s.from !== stop.from), stop].sort((a, b) =>
        a.from < b.from ? -1 : 1,
      ),
    );
  }

  const complet = Boolean(start && end && stops.length > 0 && stops[0].from === start);

  return (
    <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>
        Tu pars quand ?
      </Text>

      <DateGrid
        from={start}
        horizonDays={HORIZON_DAYS}
        ink="#10242F"
        muted="#66747D"
        onPick={pickDate}
        reduced={reduced}
        surface="#E4ECEF"
        to={end}
      />
      <Text style={styles.hint}>
        Au-delà de seize jours, la météo n’existe pas encore.
      </Text>

      {start ? (
        <View style={styles.stops}>
          <Text accessibilityRole="header" style={styles.subtitle}>
            Où ?
          </Text>

          {stops.map((stop) => (
            <View key={stop.from} style={styles.stop}>
              <Text style={styles.stopPlace}>{stop.place.name.split(',')[0]}</Text>
              <Text style={styles.stopFrom}>
                {stop.from === start ? 'à l’arrivée' : `à partir du ${Number(stop.from.slice(8))}`}
              </Text>
              {stop.from === start ? null : (
                <PressableScale
                  accessibilityLabel={`Retirer ${stop.place.name.split(',')[0]}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setStops(stops.filter((s) => s.from !== stop.from))}
                  reduced={reduced}
                  style={styles.remove}>
                  <Text style={styles.removeText}>Retirer</Text>
                </PressableScale>
              )}
            </View>
          ))}

          <PressableScale
            accessibilityRole="button"
            onPress={() => addStop(stops.length === 0 ? start : null)}
            reduced={reduced}
            style={styles.action}>
            <Text style={styles.actionText}>
              {stops.length === 0 ? 'Choisir la ville' : 'Ajouter une étape'}
            </Text>
          </PressableScale>
        </View>
      ) : null}

      <PressableScale
        accessibilityRole="button"
        disabled={!complet}
        onPress={() =>
          onDone({
            id: initial?.id ?? `trip-${Date.now()}`,
            start: start as string,
            end: end as string,
            stops,
            packed: initial?.packed ?? [],
          })
        }
        reduced={reduced}
        style={[styles.primary, complet ? null : styles.disabled]}>
        <Text style={styles.primaryText}>Voir ma valise</Text>
      </PressableScale>

      <PressableScale accessibilityRole="button" onPress={onCancel} reduced={reduced} style={styles.action}>
        <Text style={styles.actionText}>Annuler</Text>
      </PressableScale>
    </ScrollView>
  );
}
```

**Note sur l'ajout d'une étape** : `addStop(null)` a besoin d'un jour d'arrivée. Ajouter, avant `openPlaceFinder`, un second `DateGrid` borné par `min={start}` et `max={end}` pour choisir ce jour — ou, plus simple et suffisant, appeler `addStop` avec le jour touché sur la grille quand un séjour est déjà complet. Retenir la seconde forme : quand `start` et `end` sont posés, un appui sur une date **dans** le séjour propose d'y placer une étape, et un appui hors du séjour recommence la sélection. Implémenter cette branche dans `pickDate` :

```tsx
    // Un séjour déjà posé : un appui à l'intérieur place une étape, un appui
    // dehors recommence. C'est la même grille pour les deux gestes, sans un
    // second sélecteur à apprendre.
    if (start && end && date > start && date <= end) {
      void addStop(date);
      return;
    }
```

La feuille de styles, en entier. Les quatre premières valeurs sont celles de `PlacePicker` dans `apps/mobile/src/app/index.tsx` (lignes 580-593) : cet éditeur est une feuille comme les autres, sur fond clair, indépendante du ciel.

```tsx
const styles = StyleSheet.create({
  sheet: { backgroundColor: '#F7FAFB', flexGrow: 1, paddingHorizontal: 20, paddingTop: 18 },
  title: { color: '#10242F', fontSize: 22, fontWeight: '700', marginBottom: 18 },
  primary: {
    alignItems: 'center',
    backgroundColor: '#10242F',
    borderRadius: 14,
    marginTop: 28,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  action: { justifyContent: 'center', minHeight: 44, marginTop: 12 },
  actionText: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  // Un bouton inatteignable reste visible : le retirer ferait sauter la mise en
  // page à chaque date touchée.
  disabled: { opacity: 0.4 },
  hint: { color: '#425A66', fontSize: 14, lineHeight: 20, marginTop: 10 },
  subtitle: { color: '#10242F', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  stops: { marginTop: 26 },
  stop: {
    alignItems: 'center',
    borderBottomColor: '#C3D0D5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
  },
  stopPlace: { color: '#10242F', flex: 1, fontSize: 16 },
  stopFrom: { color: '#66747D', fontSize: 14 },
  remove: { justifyContent: 'center', minHeight: 44 },
  removeText: { color: '#66747D', fontSize: 14, fontWeight: '600' },
});
```

`disabled` sur `PressableScale` : vérifier que le composant transmet bien la prop à son `Pressable` sous-jacent ; sinon, garder l'appui et ne rien faire dans `onPress` quand `complet` est faux, plutôt que d'ajouter une prop au composant de mouvement.

- [ ] **Step 2: Écrire l'écran**

Créer `apps/mobile/src/app/packing.tsx` :

```tsx
/*
 * THESIS: une valise est une réponse, pas une checklist — la liste d'abord,
 * les journées ensuite, comme la tenue passe avant la météo sur l'accueil.
 * STORY: choisir son séjour, lire ce qu'on emporte, parcourir les jours de
 * là-bas et voir leur ciel.
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { luminanceOf, veilFor } from '@/core/weather';
import { useNow } from '@/hooks/use-now';
import { useProfile } from '@/hooks/use-profile';
import { useTrip } from '@/hooks/use-trip';
import { PressableScale } from '@/motion/PressableScale';
import { Reveal } from '@/motion/Reveal';
import { useMotion } from '@/motion/use-motion';
import { TripEditor } from '@/packing/TripEditor';
import { SkyBackground } from '@/sky/SkyBackground';
import { useSkyMood } from '@/sky/use-sky-mood';
import { DayRail } from '@/timeline/DayRail';

export default function PackingScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { profile } = useProfile();
  const { trip, packing, words, loading, error, save, refresh } = useTrip(profile);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { width, height } = useWindowDimensions();
  const at = useNow();
  const motion = useMotion();
  const reduced = motion.reduced;

  // Au retour sur l'écran, la prévision se revalide : une valise ouverte hier
  // soir conseillerait encore la météo d'hier. Le premier passage est ignoré —
  // le hook vient déjà de charger, et refaire la requête doublerait l'attente.
  const premierPassage = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (premierPassage.current) {
        premierPassage.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
  );

  const selected = packing?.days.find((day) => day.id === selectedId) ?? packing?.days[0];
  const sky = useSkyMood(selected?.weather, at, motion);
  const ink = sky.ink;
  const muted = `${ink}B0`;
  const veil = veilFor(ink, [sky.zenith, sky.horizon]);
  const scrim = `${veil.color}${Math.round(veil.alpha * 255).toString(16).padStart(2, '0')}`;
  const surface = luminanceOf(ink) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.46)';

  if (!trip || editing) {
    return (
      <SafeAreaView style={styles.editor}>
        <StatusBar style="dark" />
        <TripEditor
          initial={trip}
          onCancel={() => setEditing(false)}
          onDone={async (next) => {
            await save(next);
            setEditing(false);
          }}
          openPlaceFinder={async () => null}
          reduced={reduced}
        />
      </SafeAreaView>
    );
  }

  if (loading && !packing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Je regarde le ciel de là-bas…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SkyBackground height={height} state={sky} width={width} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} />

      <SafeAreaView style={styles.screen}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl onRefresh={refresh} refreshing={loading} tintColor={ink} />}
          showsVerticalScrollIndicator={false}>
          <PressableScale
            accessibilityHint="Change les dates ou les villes du séjour"
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            reduced={reduced}
            style={styles.topline}>
            <Text numberOfLines={2} style={styles.title}>
              <Text style={{ color: ink }}>{words?.title}</Text>
              <Text style={{ color: muted }}> · {words?.dates}</Text>
            </Text>
          </PressableScale>

          {error ? (
            <View>
              <Text style={[styles.error, { color: ink }]}>{error}</Text>
              <PressableScale
                accessibilityRole="button"
                onPress={refresh}
                reduced={reduced}
                style={styles.retry}>
                <Text style={[styles.retryText, { color: ink }]}>Réessayer</Text>
              </PressableScale>
            </View>
          ) : null}

          {/* L'avancement, s'il y a quelque chose à avancer. La coche arrive en
              tâche 13 ; la ligne est déjà juste avec zéro coche. */}
          {packing?.progress && packing.progress.total > 0 ? (
            <Text style={[styles.progress, { color: muted }]}>
              {packing.progress.done} sur {packing.progress.total} dans le sac.
            </Text>
          ) : null}

          <View style={styles.list}>
            {words?.wear.map((item, rang) => (
              <Reveal index={rang} key={item.key} reduced={reduced}>
                <View style={styles.item}>
                  <Text style={[styles.itemLabel, { color: ink }]}>{item.label}</Text>
                  {item.detail ? (
                    <Text style={[styles.itemDetail, { color: muted }]}>{item.detail}</Text>
                  ) : null}
                  <Text style={[styles.itemWhy, { color: muted }]}>{item.why}</Text>
                </View>
              </Reveal>
            ))}
          </View>

          {words && words.carry.length > 0 ? (
            <View style={styles.list}>
              <Text style={[styles.sectionTitle, { color: muted }]}>Et tu emportes</Text>
              {words.carry.map((item) => (
                <View key={item.key} style={styles.item}>
                  <Text style={[styles.itemLabel, { color: ink }]}>{item.label}</Text>
                  <Text style={[styles.itemWhy, { color: muted }]}>{item.why}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {packing ? (
            <DayRail
              days={packing.days}
              horizon={sky.horizon}
              ink={ink}
              muted={muted}
              onSelect={setSelectedId}
              reduced={reduced}
              selectedId={selected?.id ?? ''}
              surface={surface}
            />
          ) : null}

          {selected ? (
            <View style={[styles.day, { backgroundColor: surface }]}>
              <Text style={[styles.dayPlace, { color: muted }]}>
                {selected.place.name.split(',')[0]}
              </Text>
              <Text style={[styles.dayWear, { color: ink }]}>{selected.phrasing.wear}</Text>
              <Text style={[styles.dayWeather, { color: muted }]}>{selected.phrasing.weather}</Text>
              {selected.phrasing.confidence ? (
                <Text style={[styles.dayWeather, { color: muted }]}>
                  {selected.phrasing.confidence}
                </Text>
              ) : null}
            </View>
          ) : null}

          {words?.notes.map((note) => (
            <View key={note.label} style={[styles.note, { borderColor: `${muted}40` }]}>
              <Text style={[styles.noteLabel, { color: ink }]}>{note.label}</Text>
              <Text style={[styles.noteText, { color: muted }]}>
                {note.when ? `${note.when} · ` : ''}
                {note.text}
              </Text>
            </View>
          ))}

          {words?.confidence ? (
            <Text style={[styles.aside, { color: muted }]}>{words.confidence}</Text>
          ) : null}
          {words?.horizon ? (
            <Text style={[styles.aside, { color: muted }]}>{words.horizon}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
```

La feuille de styles, en entier — les huit premières valeurs sont celles de `apps/mobile/src/app/index.tsx`, pour que les deux écrans se ressemblent sans qu'un thème partagé soit à inventer :

```tsx
const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { backgroundColor: 'transparent', flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  loading: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  loadingText: { fontSize: 17 },
  topline: { justifyContent: 'center', minHeight: 44, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 29 },
  note: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  noteLabel: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  noteText: { fontSize: 15, lineHeight: 21 },
  aside: { fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 20 },
  progress: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  list: { marginTop: 22 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' },
  item: { paddingVertical: 10 },
  // Serif, comme la tenue sur l'accueil : c'est le conseil, pas une mesure.
  itemLabel: {
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 26,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  itemDetail: { fontSize: 15, fontStyle: 'italic', lineHeight: 21, marginTop: 2 },
  itemWhy: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  day: { borderRadius: 16, marginTop: 18, padding: 16 },
  dayPlace: { fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  dayWear: { fontSize: 19, lineHeight: 26, marginTop: 6 },
  dayWeather: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  editor: { backgroundColor: '#F7FAFB', flex: 1 },
  error: { fontSize: 15, lineHeight: 21, marginTop: 10 },
  retry: { justifyContent: 'center', minHeight: 44 },
  retryText: { fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 3: Élargir le type de `DayRail`, sans le forcer**

`DayRail` déclare `days: ForecastDay[]`, et une journée de séjour n'a pas d'`isToday` ni de `versusYesterday`. Un `as never` ferait taire le compilateur sans rien prouver. Le composant, lui, ne lit que trois champs — c'est donc ça qu'il doit demander. Dans `apps/mobile/src/timeline/DayRail.tsx`, remplacer le type de la prop et celui de `DayTab` :

```tsx
/**
 * Ce dont le ruban a besoin, et rien de plus : il sert la semaine de l'accueil
 * comme les journées d'un séjour, qui n'ont pas d'« hier » à comparer.
 */
type RailDay = Pick<ForecastDay, 'id' | 'label' | 'weather'>;
```

Puis `days: RailDay[]` dans les props de `DayRail`, et `day: RailDay` dans celles de `DayTab`. Vérifier que `shortDayLabel` et `dayTemperature` ne lisent rien d'autre — au moment d'écrire ce plan, elles lisent `label` et `weather.feelsLikeMin`/`feelsLikeMax` uniquement.

- [ ] **Step 4: Brancher la recherche de ville**

`openPlaceFinder` rend `null` dans le squelette ci-dessus, ce qui empêche de choisir une ville. Extraire `PlacePicker` de `apps/mobile/src/app/index.tsx` (lignes 105-202) vers `apps/mobile/src/places/PlacePicker.tsx`, sans changer son comportement, et l'importer aux deux endroits. Dans `packing.tsx`, le monter dans un `Modal` et faire de `openPlaceFinder` une promesse résolue par `onSelect` :

```tsx
  const [finder, setFinder] = useState<((place: Place | null) => void) | null>(null);

  const openPlaceFinder = () =>
    new Promise<Place | null>((resolve) => setFinder(() => resolve));
```

```tsx
      <Modal
        animationType="slide"
        onRequestClose={() => { finder?.(null); setFinder(null); }}
        presentationStyle="pageSheet"
        visible={finder !== null}>
        <PlacePicker
          onClose={() => { finder?.(null); setFinder(null); }}
          onSelect={async (place) => { finder?.(place); setFinder(null); }}
          reduced={reduced}
          searchPlaces={searchPlaces}
          visible
        />
      </Modal>
```

`searchPlaces` vient de `geocode`, exporté par `@/core/weather` — l'importer directement plutôt que de passer par `useForecast`, qui déclencherait une requête météo dont cet écran n'a pas besoin.

- [ ] **Step 5: Ajouter l'entrée depuis l'accueil**

Dans `apps/mobile/src/app/index.tsx`, juste après le bloc `<DayRail … />` (vers la ligne 440), ajouter :

```tsx
          {/* Là où l'attention est déjà tournée vers les jours à venir. */}
          <PressableScale
            accessibilityHint="Ouvre la valise pour un séjour"
            accessibilityRole="button"
            onPress={() => router.push('/packing')}
            reduced={reduced}
            style={styles.tripLink}>
            <Text style={[styles.tripLinkText, { color: ink }]}>
              Tu pars quelque part ? Prévoir ta valise.
            </Text>
          </PressableScale>
```

Ajouter `import { useRouter } from 'expo-router';` et `const router = useRouter();` dans `HomeScreen`, ainsi que le style :

```tsx
  tripLink: { justifyContent: 'center', marginTop: 18, minHeight: 44 },
  tripLinkText: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
```

- [ ] **Step 6: Vérifier**

Run: `cd apps/mobile && npm run typecheck && npm run lint`
Expected: PASS.

Puis vérifier à l'œil, sur simulateur ou appareil : `npm run ios` (ou `npm run web` pour une vérification rapide de la mise en page). Contrôler six choses — l'accueil affiche le lien ; le lien ouvre l'écran ; l'écran vide propose les dates ; un séjour de trois jours à une ville affiche une liste avec des raisons ; le ruban des jours change le ciel ; quitter l'écran et y revenir recharge la prévision une fois, pas deux.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/packing.tsx apps/mobile/src/packing apps/mobile/src/places apps/mobile/src/app/index.tsx
git commit -m "feat: ouvrir la valise depuis l'accueil, et la lire jour par jour"
```

---

### Task 12: le trait d'étape dans le ruban

**Files:**
- Modify: `apps/mobile/src/timeline/DayRail.tsx`
- Modify: `apps/mobile/src/app/packing.tsx`

**Interfaces:**
- Consumes: `DayRail` de la tâche 11.
- Produces: `DayRail` accepte une prop optionnelle `boundaries?: string[]` — les identifiants des journées qui **commencent** une nouvelle étape. Un trait fin est dessiné avant chacune. Sans la prop, le composant se comporte exactement comme aujourd'hui, et l'accueil n'a pas à changer.

**Pourquoi** : sans ce trait, le jour où l'on change de ville ressemble à tous les autres. Le panneau du jour nomme bien la ville, mais il faut alors toucher chaque jour pour savoir où l'on est.

- [ ] **Step 1: Ajouter la prop et le trait**

Dans `DayRail`, ajouter `boundaries = []` à la signature — typée `boundaries?: string[]` — puis, dans le `days.map(...)` (ligne 183), poser le trait **en absolu** devant l'onglet :

```tsx
        {days.map((day) => (
          <View key={day.id}>
            {boundaries.includes(day.id) ? (
              <View
                pointerEvents="none"
                style={[styles.boundary, { backgroundColor: `${muted}55` }]}
              />
            ) : null}
            <DayTab … />
          </View>
        ))}
```

```tsx
  // En absolu, et non intercalé dans la rangée : les positions de la pastille
  // sont mesurées (voir l'en-tête du fichier), et une vue de plus dans le flux
  // décalerait toutes les abscisses d'un demi-trait. Un trait, pas un espace —
  // un espace se lirait comme une fin de liste.
  boundary: { bottom: 0, left: -4, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
```

Le `<View>` d'enveloppe ne change rien à la mise en page — il n'a ni style ni direction — mais il donne au trait un parent contre lequel se positionner. Vérifier après coup que la pastille tombe toujours pile sur l'onglet choisi, sur l'accueil comme sur la valise.

- [ ] **Step 2: Passer les frontières depuis l'écran**

Dans `apps/mobile/src/app/packing.tsx`, calculer les frontières et les passer :

```tsx
  // Le premier jour de chaque étape, sauf le premier du séjour : un trait avant
  // la première journée ne séparerait rien.
  const boundaries = (packing?.days ?? [])
    .filter((day, index, jours) => index > 0 && day.place.name !== jours[index - 1].place.name)
    .map((day) => day.id);
```

```tsx
            <DayRail boundaries={boundaries} days={packing.days} … />
```

- [ ] **Step 3: Vérifier**

Run: `cd apps/mobile && npm run typecheck && npm run lint`
Expected: PASS.

À l'œil, sur un séjour à deux villes : le trait tombe entre le dernier jour de la première ville et le premier de la seconde, et la pastille de sélection reste alignée sur l'onglet choisi. Vérifier aussi l'accueil, qui ne passe pas la prop : le ruban doit être identique à avant.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/timeline/DayRail.tsx apps/mobile/src/app/packing.tsx
git commit -m "feat: marquer dans le ruban le jour ou l'on change de ville"
```

---

# Étape C — les coches

### Task 13: cocher, et s'en souvenir

**Files:**
- Modify: `apps/mobile/src/hooks/use-trip.ts`
- Modify: `apps/mobile/src/app/packing.tsx`

**Interfaces:**
- Consumes: `applyPacked`, `prunePacked` de `@/core/packing` ; `save` de `useTrip`.
- Produces: `useTrip().toggle(key: string): Promise<void>` — bascule la coche d'une ligne, élague les clés sans objet, et écrit le voyage.

- [ ] **Step 1: Ajouter `toggle` au hook**

Dans `apps/mobile/src/hooks/use-trip.ts`, importer `prunePacked` et ajouter, après `save` :

```ts
  /**
   * Cocher ou décocher une ligne.
   *
   * L'élagage a lieu ici, à l'écriture : une clé devenue sans objet — le
   * manteau d'un séjour devenu estival — ne doit pas dormir sur le disque et
   * recocher une ligne qui réapparaîtrait des mois plus tard.
   */
  const toggle = useCallback(
    async (key: string) => {
      if (!trip) return;

      const cochees = trip.packed.includes(key)
        ? trip.packed.filter((k) => k !== key)
        : [...trip.packed, key];

      const retenues = packing ? (prunePacked(packing, cochees) as string[]) : cochees;
      await save({ ...trip, packed: retenues });
    },
    [trip, packing, save],
  );
```

Et l'ajouter au retour du hook, à côté de `save`.

**Attention** : `save` déclenche un nouveau `Trip`, donc un nouveau `buildTrip`, donc un nouveau `packing`. Les prévisions, elles, ne sont pas rechargées — `load` ne dépend que de `trip`, et `useEffect` le compare par identité. Vérifier que cocher ne relance **pas** de requête réseau : si c'est le cas, faire dépendre l'effet de `trip?.id` et des étapes plutôt que de l'objet entier :

```ts
  const stopsKey = trip ? `${trip.id}:${trip.stops.map((s) => `${s.from}@${s.place.name}`).join('|')}:${trip.end}` : null;

  useEffect(() => {
    void load(trip);
    // Les coches changent l'objet `trip` sans changer ce qu'il faut demander au
    // réseau : cocher un t-shirt ne doit pas rappeler Open-Meteo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey]);
```

- [ ] **Step 2: Rendre les lignes touchables**

Dans `apps/mobile/src/app/packing.tsx`, prendre `toggle` du hook, et remplacer chaque `<View style={styles.item}>` par un `PressableScale`. La coche vient de `packing`, les mots de `words` — les deux tableaux sont dans le même ordre, mais on associe par clé plutôt que par index :

```tsx
  const packedKeys = new Set(
    [...(packing?.wear ?? []), ...(packing?.carry ?? [])]
      .filter((item) => item.packed)
      .map((item) => item.key),
  );
```

```tsx
                <PressableScale
                  accessibilityLabel={`${item.label}, ${packedKeys.has(item.key) ? 'dans le sac' : 'à mettre dans le sac'}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: packedKeys.has(item.key) }}
                  onPress={() => toggle(item.key)}
                  reduced={reduced}
                  scaleTo={0.985}
                  style={styles.item}>
                  <Text
                    style={[
                      styles.itemLabel,
                      { color: ink },
                      packedKeys.has(item.key) ? styles.done : null,
                    ]}>
                    {item.label}
                  </Text>
                  …
                </PressableScale>
```

Style de la ligne cochée — barrée et estompée, pas disparue : ce qui est dans le sac doit rester vérifiable.

```tsx
  done: { opacity: 0.45, textDecorationLine: 'line-through' },
```

Appliquer le même traitement aux lignes de `carry`.

- [ ] **Step 3: Vérifier**

Run: `cd apps/mobile && npm run typecheck && npm run lint`
Expected: PASS.

À l'œil : cocher une ligne la barre et fait monter le compteur ; quitter l'écran et revenir garde les coches ; tirer pour rafraîchir ne les perd pas ; cocher ne déclenche aucune requête réseau (le vérifier dans les logs Metro).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/use-trip.ts apps/mobile/src/app/packing.tsx
git commit -m "feat: cocher ce qui est deja dans le sac, et s'en souvenir"
```

---

# Étape D — la bibliothèque de voyages

### Task 14: « Mes voyages »

**Files:**
- Create: `apps/mobile/src/packing/TripLibrary.tsx`
- Modify: `apps/mobile/src/app/packing.tsx`

**Interfaces:**
- Consumes: `trips`, `trip`, `select`, `remove` de `useTrip` ; `dayLabel` n'est **pas** utilisée ici — les libellés viennent de `describePacking` pour le voyage courant seulement, la liste formate ses dates elle-même.
- Produces:
```tsx
<TripLibrary
  trips={Trip[]}
  currentId={string | null}
  onSelect={(id: string) => void}
  onRemove={(id: string) => void}
  onCreate={() => void}
  onClose={() => void}
  reduced={boolean}
/>
```

- [ ] **Step 1: Écrire la feuille**

Créer `apps/mobile/src/packing/TripLibrary.tsx` :

```tsx
/**
 * Les voyages gardés sur l'appareil.
 *
 * Les voyages terminés restent, en grisé : « le même séjour l'an prochain » est
 * un vrai usage, et une suppression automatique se remarque toujours trop tard.
 * On peut les retirer à la main, jamais par surprise.
 *
 * Une feuille plutôt qu'une route de plus : c'est le motif déjà employé pour la
 * ville et le vestiaire.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/motion/PressableScale';
import type { Trip } from '@/lib/types';

function todayIso() {
  const at = new Date();
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function titleOf(trip: Trip) {
  return trip.stops.map((stop) => stop.place.name.split(',')[0].trim()).join(' → ');
}

function datesOf(trip: Trip) {
  const jourEtMois = (date: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
      new Date(`${date}T12:00:00`),
    );

  return `${jourEtMois(trip.start)} → ${jourEtMois(trip.end)}`;
}

export function TripLibrary({
  trips,
  currentId,
  onSelect,
  onRemove,
  onCreate,
  onClose,
  reduced,
}: {
  trips: Trip[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
  reduced: boolean;
}) {
  const jour = todayIso();
  const parDate = [...trips].sort((a, b) => (a.start < b.start ? -1 : 1));
  const avenir = parDate.filter((trip) => trip.end >= jour);
  const passes = parDate.filter((trip) => trip.end < jour).reverse();

  const ligne = (trip: Trip, fini: boolean) => (
    <View key={trip.id} style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ selected: trip.id === currentId }}
        onPress={() => onSelect(trip.id)}
        reduced={reduced}
        style={styles.rowMain}>
        <Text style={[styles.rowTitle, fini ? styles.faded : null]}>{titleOf(trip)}</Text>
        <Text style={[styles.rowDates, fini ? styles.faded : null]}>{datesOf(trip)}</Text>
      </PressableScale>
      <PressableScale
        accessibilityLabel={`Retirer ${titleOf(trip)}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onRemove(trip.id)}
        reduced={reduced}
        style={styles.remove}>
        <Text style={styles.removeText}>Retirer</Text>
      </PressableScale>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.sheet}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Mes voyages
        </Text>
        <PressableScale accessibilityRole="button" hitSlop={10} onPress={onClose} reduced={reduced} style={styles.close}>
          <Text style={styles.closeText}>Fermer</Text>
        </PressableScale>
      </View>

      {avenir.map((trip) => ligne(trip, false))}

      {passes.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={styles.section}>
            Passés
          </Text>
          {passes.map((trip) => ligne(trip, true))}
        </>
      ) : null}

      <PressableScale accessibilityRole="button" onPress={onCreate} reduced={reduced} style={styles.primary}>
        <Text style={styles.primaryText}>Nouveau voyage</Text>
      </PressableScale>
    </ScrollView>
  );
}
```

La feuille de styles, en entier :

```tsx
const styles = StyleSheet.create({
  sheet: { backgroundColor: '#F7FAFB', flexGrow: 1, paddingHorizontal: 20, paddingTop: 18 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  title: { color: '#10242F', fontSize: 22, fontWeight: '700' },
  close: { justifyContent: 'center', minHeight: 44 },
  closeText: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  section: {
    color: '#66747D',
    fontSize: 13,
    letterSpacing: 0.6,
    marginTop: 26,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#C3D0D5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
  },
  rowMain: { flex: 1, justifyContent: 'center', minHeight: 64 },
  rowTitle: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  rowDates: { color: '#66747D', fontSize: 14, marginTop: 2 },
  // Estompé, pas caché : un voyage fini reste consultable, et se refait l'an
  // prochain.
  faded: { opacity: 0.5 },
  remove: { justifyContent: 'center', minHeight: 44 },
  removeText: { color: '#66747D', fontSize: 14, fontWeight: '600' },
  primary: {
    alignItems: 'center',
    backgroundColor: '#10242F',
    borderRadius: 14,
    marginTop: 28,
    minHeight: 48,
    paddingVertical: 13,
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: L'ouvrir depuis l'écran**

Dans `apps/mobile/src/app/packing.tsx` : prendre `trips`, `select`, `remove` du hook, ajouter un état `libraryOpen`, un bouton dans la barre du haut — les trois points, comme sur l'accueil — et le `Modal`. « Nouveau voyage » ouvre `TripEditor` avec `initial={null}` : ajouter un état `creating` distinct de `editing`, pour que créer ne modifie pas le voyage courant.

```tsx
  const [creating, setCreating] = useState(false);
```

```tsx
  if (!trip || editing || creating) {
    return (
      <SafeAreaView style={styles.editor}>
        <StatusBar style="dark" />
        <TripEditor
          initial={creating ? null : trip}
          onCancel={() => { setEditing(false); setCreating(false); }}
          onDone={async (next) => {
            await save(next);
            setEditing(false);
            setCreating(false);
          }}
          openPlaceFinder={openPlaceFinder}
          reduced={reduced}
        />
      </SafeAreaView>
    );
  }
```

- [ ] **Step 3: Vérifier**

Run: `cd apps/mobile && npm run typecheck && npm run lint`
Expected: PASS.

À l'œil : créer deux voyages, passer de l'un à l'autre, vérifier que les coches ne se mélangent pas entre eux ; créer un voyage dont la fin est passée et vérifier qu'il tombe dans « Passés » et que l'écran ouvre l'autre ; retirer un voyage et rouvrir l'app pour vérifier qu'il ne revient pas.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/packing/TripLibrary.tsx apps/mobile/src/app/packing.tsx
git commit -m "feat: garder plusieurs voyages, et laisser les passes tranquilles"
```

---

### Task 15: la documentation, et la preuve

**Files:**
- Modify: `README.md` (la table des modules, et la section « À venir »)
- Modify: `PRODUCT.md` (Capabilities and Constraints)
- Create: `docs/testing/assistant-valise.tdd.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la documentation à jour, et une trace des vérifications réellement passées.

- [ ] **Step 1: Mettre le README à jour**

Dans la table des modules, après la ligne `js/hours.js`, ajouter :

```markdown
| `js/packing.js` | **pur** — un voyage et ses prévisions → une valise avec ses quantités |
```

Remplacer entièrement la section « À venir » — la valise n'est plus à venir. Y mettre à la place une section « La valise » qui dit les trois choses qu'un lecteur du dépôt ne devinera pas :

```markdown
## La valise

« Je pars du 8 au 13 septembre à Lisbonne puis à Porto » — `packing.js` applique
`rules.js` à chacune des journées du séjour, puis unit les tenues obtenues.

**La quantité vient des jours qui réclament la pièce**, pas de la durée du séjour : cinq
jours dont deux frais donnent un pull, pas cinq. Les pièces portées à même la peau se
renouvellent chaque jour, plafonnées à sept — au-delà on lave, et la ligne le dit.

**La coche tient à la racine du vêtement.** La veille du départ la météo se précise, le
pull fin devient un pull épais, et la coche reste : c'est le même crochet du placard. La
couche extérieure a pour clé `couche` et non sa racine, pour la même raison — elle est
unique, et la pièce qui y pend change.

**Un voyage est une tranche de temps continue passée dans plusieurs villes**, décrite par
un départ, un retour, et le jour d'arrivée dans chaque ville. Les trous et les
chevauchements ne sont pas exprimables, donc il n'y a rien à valider.
```

- [ ] **Step 2: Mettre PRODUCT.md à jour**

Dans « Capabilities and Constraints », ajouter :

```markdown
- L'assistant valise couvre un séjour à plusieurs villes dans les seize jours à venir ;
  au-delà, l'app dit franchement que la météo n'existe pas encore.
- Les voyages et leurs coches sont gardés sur l'appareil, sans compte ni serveur.
```

- [ ] **Step 3: Écrire la preuve TDD**

Créer `docs/testing/assistant-valise.tdd.md` sur ce squelette. **Remplir avec les résultats réels**, pas avec ceux attendus : si une vérification n'a pas été passée, l'écrire.

```markdown
# Assistant valise — preuve TDD

## Parcours couverts

- Le séjour se découpe en journées, ville par ville, et les jours passés tombent (`test/packing.test.js`).
- La quantité vient des jours qui réclament la pièce, plafonnée à sept sur les pièces de peau (`test/packing.test.js`).
- Deux poids d'une même racine tiennent en une ligne, et se dédoublent dès deux exemplaires (`test/packing.test.js`).
- Une coche survit au changement de pièce, et s'élague quand sa ligne disparaît (`test/packing.test.js`).
- Un voyage abîmé est écarté sans faire tomber l'écran (`test/packing.test.js`).
- Chaque journée dit combien de modèles répondent encore (`test/weather.test.js`).
- La valise se met en mots sans qu'aucune date ISO n'en sorte (`test/phrasing.test.js`).

Les tests ont été écrits et exécutés en échec avant l'implémentation, tâche par tâche.

## Exécution du <date>

| Vérification | Résultat |
| --- | --- |
| `npm test` à la racine | <compte> tests réussis |
| `npm run typecheck` dans `apps/mobile` | <résultat> |
| `npm run lint` dans `apps/mobile` | <résultat> |

## Vérification de parcours

<Ce qui a été contrôlé à l'œil, et où : simulateur ou appareil, taille d'écran,
séjour d'une ville puis de deux, coches conservées après redémarrage, voyage
terminé qui tombe dans « Passés ».>

## Limites restantes

<Ce qui n'a pas pu être vérifié automatiquement. Au minimum : l'app n'a aucun
banc de test, donc les composants et les hooks ne sont couverts que par le
typage, le linter et le contrôle à l'œil.>
```

- [ ] **Step 4: Vérifier une dernière fois, en entier**

```bash
npm test
cd apps/mobile && npm run typecheck && npm run lint
```

Expected: `npm test` — tous les tests passent, le compte est noté dans le document de preuve. `typecheck` et `lint` — aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add README.md PRODUCT.md docs/testing/assistant-valise.tdd.md
git commit -m "docs: dire ce que la valise decide, et ce qui le prouve"
```

---

## Ce que ce plan ne fait pas

Les trois points sont dans le spec, hors périmètre, et ne doivent pas être ajoutés en passant :

- **Les normales saisonnières** au-delà de seize jours. L'app dit qu'il est trop tôt.
- **Les essentiels non vestimentaires** — chargeur, brosse à dents. Ils ne se déduisent d'aucune prévision.
- **Le widget**, qui continue de répondre pour aujourd'hui, chez soi.

L'écran web de la valise n'est pas dessiné, mais `js/packing.js` reste pur et framework-libre : la page pourra s'en servir sans rien réécrire.
