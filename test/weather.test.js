import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeForecast, MODELS, forecastUrl } from '../js/weather.js';

/** Réponse Open-Meteo telle qu'elle arrive, pour deux jours. */
function apiResponse(overrides = {}) {
  return {
    daily: {
      time: ['2026-08-07', '2026-08-08'],
      temperature_2m_min: [12.4, 9.1],
      temperature_2m_max: [21.8, 17.3],
      apparent_temperature_min: [10.2, 6.7],
      apparent_temperature_max: [23.1, 18.0],
      precipitation_sum: [0, 4.6],
      // Le maximum quotidien s'accorde avec le pic horaire ci-dessous : une
      // journée dont une heure est à 80 % ne peut pas plafonner à 5 %.
      precipitation_probability_max: [80, 80],
      windspeed_10m_max: [11.2, 28.4],
      windgusts_10m_max: [19.8, 52.1],
      uv_index_max: [6.2, 3.1],
      weathercode: [1, 63],
      sunrise: ['2026-08-07T06:34', '2026-08-08T06:36'],
      sunset: ['2026-08-07T21:22', '2026-08-08T21:20'],
      ...overrides,
    },
    hourly: {
      // Deux jours de suite, une entrée par heure.
      time: Array.from({ length: 48 }, (_, i) =>
        `2026-08-0${i < 24 ? 7 : 8}T${String(i % 24).padStart(2, '0')}:00`),
      temperature_2m: Array.from({ length: 48 }, (_, i) => 10 + (i % 24) * 0.5),
      apparent_temperature: Array.from({ length: 48 }, (_, i) => 9 + (i % 24) * 0.5),
      precipitation: Array.from({ length: 48 }, (_, i) => (i % 24 === 19 ? 3.2 : 0)),
      precipitation_probability: Array.from({ length: 48 }, (_, i) => (i % 24 === 19 ? 80 : 5)),
      windgusts_10m: Array.from({ length: 48 }, (_, i) => (i % 24 === 16 ? 62 : 12)),
    },
    utc_offset_seconds: 7200,
  };
}

test('la requête accepte une semaine complète pour l’application mobile', () => {
  const url = forecastUrl(48.8566, 2.3522, MODELS, 7);

  assert.equal(url.searchParams.get('forecast_days'), '7');
  assert.equal(url.searchParams.get('timezone'), 'auto');
});

test('normalise un jour par entrée du tableau time', () => {
  const jours = normalizeForecast(apiResponse());

  assert.equal(jours.length, 2);
  assert.equal(jours[0].date, '2026-08-07');
  assert.equal(jours[1].date, '2026-08-08');
});

test('reporte chaque champ de l’API sur le bon champ du contrat', () => {
  // Les heures ont leurs propres tests ; on les met de côté pour vérifier ici
  // que rien d'autre n'a été ni oublié ni ajouté.
  const { hours, ...agregats } = normalizeForecast(apiResponse())[0];

  assert.equal(Array.isArray(hours), true);
  assert.deepEqual(agregats, {
    date: '2026-08-07',
    tempMin: 12.4,
    tempMax: 21.8,
    feelsLikeMin: 10.2,
    feelsLikeMax: 23.1,
    precipitationMm: 0,
    precipitationProbability: 80,
    windMaxKmh: 11.2,
    windGustsKmh: 19.8,
    uvIndex: 6.2,
    weatherCode: 1,
    sunrise: '2026-08-07T06:34',
    sunset: '2026-08-07T21:22',
    utcOffsetSeconds: 7200,
    feelsLikeSpread: null,
  });
});

test('le décalage horaire du lieu est reporté sur chaque jour', () => {
  // Les heures de lever et coucher sont locales AU LIEU. Sans son décalage,
  // on les comparerait à l'heure du navigateur, ce qui fausse tout dès qu'on
  // regarde une ville d'un autre fuseau.
  const jours = normalizeForecast({
    ...apiResponse(),
    utc_offset_seconds: -25200,
  });

  for (const jour of jours) assert.equal(jour.utcOffsetSeconds, -25200);
});

test('décalage horaire absent : on suppose UTC', () => {
  const payload = apiResponse();
  delete payload.utc_offset_seconds;

  assert.equal(normalizeForecast(payload)[0].utcOffsetSeconds, 0);
});

test('lever et coucher du soleil manquants : repli sur des heures conventionnelles', () => {
  // sky.js a besoin d'une plage de jour ; sans elle il ne saurait pas
  // distinguer midi de minuit. Un repli vaut mieux qu'un null à tester partout.
  const [jour] = normalizeForecast(apiResponse({ sunrise: [null, null], sunset: [null, null] }));

  assert.equal(jour.sunrise, '2026-08-07T06:00');
  assert.equal(jour.sunset, '2026-08-07T20:00');
});

test('une valeur nulle devient une valeur neutre, jamais null', () => {
  // Open-Meteo omet parfois la probabilité de précipitation ou l'UV.
  const payload = apiResponse({
    precipitation_probability_max: [null, null],
    uv_index_max: [null, null],
    windgusts_10m_max: [null, null],
    windspeed_10m_max: [null, null],
    precipitation_sum: [null, null],
  });

  // Muet aussi côté horaire : le jour dérive son chiffre du tracé quand il
  // existe, et ce test-ci porte sur le cas où plus rien ne répond.
  payload.hourly.precipitation_probability = Array(48).fill(null);

  const jours = normalizeForecast(payload);

  for (const jour of jours) {
    for (const [champ, valeur] of Object.entries(jour)) {
      // L'enveloppe entre modèles est légitimement nulle en mono-modèle :
      // prétendre mesurer un accord entre une seule source serait faux.
      if (champ === 'feelsLikeSpread') continue;
      assert.notEqual(valeur, null, `${champ} ne doit jamais être null`);
      assert.notEqual(valeur, undefined, `${champ} ne doit jamais être undefined`);
    }
    assert.equal(jour.precipitationProbability, 0);
    assert.equal(jour.uvIndex, 0);
    assert.equal(jour.windGustsKmh, 0);
    assert.equal(jour.precipitationMm, 0);
  }
});

test('un tableau daily absent lève une erreur explicite plutôt que de produire du vide', () => {
  assert.throws(() => normalizeForecast({}), /prévision/i);
  assert.throws(() => normalizeForecast({ daily: {} }), /prévision/i);
});

test('les rafales manquantes retombent sur le vent moyen quand il est connu', () => {
  // Sans rafales, ignorer le vent moyen ferait passer une journée ventée pour calme.
  const [jour] = normalizeForecast(
    apiResponse({ windgusts_10m_max: [null, null], windspeed_10m_max: [46, 46] }),
  );

  assert.equal(jour.windMaxKmh, 46);
  assert.equal(jour.windGustsKmh, 46);
});

/* ------------------------------------------------------ données horaires */

test('chaque jour reçoit ses vingt-quatre heures, et seulement les siennes', () => {
  const jours = normalizeForecast(apiResponse());

  assert.equal(jours[0].hours.length, 24);
  assert.equal(jours[1].hours.length, 24);
  assert.deepEqual(jours[0].hours.map((h) => h.hour), [...Array(24).keys()]);
});

test('une heure porte tout ce dont la courbe a besoin', () => {
  const [jour] = normalizeForecast(apiResponse());

  assert.deepEqual(jour.hours[19], {
    hour: 19,
    temp: 19.5,
    feelsLike: 18.5,
    precipitationMm: 3.2,
    precipitationProbability: 80,
    windGustsKmh: 12,
    feelsLikeLow: null,
    feelsLikeHigh: null,
  });
});

test('les rafales sont relevées heure par heure', () => {
  // Sans elles, on peut dire qu'il va souffler mais jamais quand.
  const [jour] = normalizeForecast(apiResponse());

  assert.equal(jour.hours[16].windGustsKmh, 62);
  assert.equal(jour.hours[17].windGustsKmh, 12);
});

test('les valeurs horaires manquantes deviennent neutres, jamais null', () => {
  const payload = apiResponse();
  payload.hourly.precipitation_probability = Array(48).fill(null);
  payload.hourly.apparent_temperature = Array(48).fill(null);
  payload.hourly.windgusts_10m = Array(48).fill(null);

  const [jour] = normalizeForecast(payload);

  for (const h of jour.hours) {
    assert.equal(h.precipitationProbability, 0);
    assert.equal(h.windGustsKmh, 0);
    // Sans ressenti, on retombe sur la température réelle plutôt que sur zéro,
    // qui ferait plonger la courbe à la verticale.
    assert.equal(h.feelsLike, h.temp);
  }
});

test('sans bloc horaire, le tableau est vide plutôt qu’absent', () => {
  const payload = apiResponse();
  delete payload.hourly;

  const [jour] = normalizeForecast(payload);

  assert.deepEqual(jour.hours, []);
});

/* --------------------------------------------------- l’ensemble de modèles */

/** Réponse multi-modèles : chaque champ suffixé par le nom du modèle. */
function ensembleResponse(parModele) {
  const daily = { time: ['2026-08-07'] };
  const hourly = { time: Array.from({ length: 24 }, (_, h) => `2026-08-07T${String(h).padStart(2, '0')}:00`) };

  for (const [modele, valeurs] of Object.entries(parModele)) {
    for (const [champ, v] of Object.entries(valeurs.daily ?? {})) daily[`${champ}_${modele}`] = [v];
    for (const [champ, v] of Object.entries(valeurs.hourly ?? {})) {
      hourly[`${champ}_${modele}`] = Array(24).fill(v);
    }
  }

  return { daily, hourly, utc_offset_seconds: 0 };
}

test('les agrégats quotidiens sont la médiane des modèles', () => {
  const payload = ensembleResponse({
    [MODELS[0]]: { daily: { apparent_temperature_max: 30 } },
    [MODELS[1]]: { daily: { apparent_temperature_max: 34 } },
    [MODELS[2]]: { daily: { apparent_temperature_max: 32 } },
  });

  assert.equal(normalizeForecast(payload)[0].feelsLikeMax, 32);
});

test('un modèle muet sur une variable n’entre pas dans sa médiane', () => {
  // Météo-France et UKMO ne publient pas la probabilité de pluie. Les compter
  // pour zéro ferait passer une journée pluvieuse pour sèche.
  const payload = ensembleResponse({
    [MODELS[0]]: { daily: { precipitation_probability_max: 80 } },
    [MODELS[1]]: { daily: { precipitation_probability_max: 90 } },
    [MODELS[2]]: { daily: { precipitation_probability_max: null } },
    [MODELS[3]]: { daily: { precipitation_probability_max: null } },
  });

  assert.equal(normalizeForecast(payload)[0].precipitationProbability, 85);
});

test('la probabilité du jour est le sommet de la courbe horaire', () => {
  // Les modèles s'accordent sur la pluie mais pas sur l'heure : l'un l'attend
  // à 5 h, l'autre à 20 h. La médiane des maxima quotidiens annoncerait 60 %,
  // quand la courbe horaire ne montrerait de pluie nulle part — c'est
  // exactement la contradiction qu'on supprime.
  // Trois modèles, pour que la médiane et la moyenne divergent vraiment : à
  // deux, la médiane vaut déjà la moyenne et ne prouverait rien.
  const heures = Array.from({ length: 24 }, (_, h) => `2026-08-07T${String(h).padStart(2, '0')}:00`);
  const creux = (pic) => Array.from({ length: 24 }, (_, h) => (h === pic ? 60 : 0));

  const payload = {
    daily: {
      time: ['2026-08-07'],
      [`precipitation_probability_max_${MODELS[0]}`]: [60],
      [`precipitation_probability_max_${MODELS[1]}`]: [60],
      [`precipitation_probability_max_${MODELS[2]}`]: [0],
    },
    hourly: {
      time: heures,
      [`precipitation_probability_${MODELS[0]}`]: creux(20),
      [`precipitation_probability_${MODELS[1]}`]: creux(5),
      [`precipitation_probability_${MODELS[2]}`]: creux(-1), // sec toute la journée
    },
    utc_offset_seconds: 0,
  };

  const [jour] = normalizeForecast(payload);

  // Mise en commun de [0, 60, 0] : 20 %. La médiane, elle, dirait 0.
  assert.equal(jour.hours[5].precipitationProbability, 20);
  assert.equal(jour.hours[20].precipitationProbability, 20);
  assert.equal(jour.precipitationProbability, 20, 'le jour ne dépasse pas son heure la plus arrosée');
});

test('sans probabilité horaire publiée, le jour retombe sur les maxima quotidiens', () => {
  // Certains modèles ne publient que le quotidien. Dériver le jour d'heures
  // absentes ferait passer une journée pluvieuse pour sèche.
  const payload = ensembleResponse({
    [MODELS[0]]: { daily: { precipitation_probability_max: 80 } },
    [MODELS[1]]: { daily: { precipitation_probability_max: 90 } },
  });

  assert.equal(normalizeForecast(payload)[0].precipitationProbability, 85);
});

test('chaque heure porte l’enveloppe du ressenti entre modèles', () => {
  const payload = ensembleResponse({
    [MODELS[0]]: { hourly: { apparent_temperature: 12 } },
    [MODELS[1]]: { hourly: { apparent_temperature: 18 } },
    [MODELS[2]]: { hourly: { apparent_temperature: 15 } },
  });

  const [jour] = normalizeForecast(payload);
  assert.equal(jour.hours[0].feelsLike, 15, 'la médiane');
  assert.equal(jour.hours[0].feelsLikeLow, 12);
  assert.equal(jour.hours[0].feelsLikeHigh, 18);
});

test('le désaccord du jour est l’écart horaire typique, pas le pire', () => {
  // Une heure aberrante ne doit pas faire passer une journée consensuelle pour
  // incertaine : on prend la médiane des écarts, pas leur maximum.
  const payload = ensembleResponse({
    [MODELS[0]]: { hourly: { apparent_temperature: 14 } },
    [MODELS[1]]: { hourly: { apparent_temperature: 16 } },
  });

  assert.equal(normalizeForecast(payload)[0].feelsLikeSpread, 2);
});

test('un seul modèle : pas d’enveloppe, pas de désaccord', () => {
  // Le repli mono-modèle ne doit pas prétendre mesurer un accord inexistant.
  const [jour] = normalizeForecast(apiResponse());

  assert.equal(jour.feelsLikeSpread, null);
  assert.equal(jour.hours[0].feelsLikeLow, null);
  assert.equal(jour.hours[0].feelsLikeHigh, null);
});

test('la requête simple reste lisible telle quelle', () => {
  // Le repli produit des champs sans suffixe : la normalisation doit les lire
  // sans broncher, sinon la page tombe quand l'ensemble échoue.
  const [jour] = normalizeForecast(apiResponse());

  assert.equal(jour.feelsLikeMax, 23.1);
  assert.equal(jour.hours[19].precipitationProbability, 80);
});
