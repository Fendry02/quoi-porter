import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeForecast } from '../js/weather.js';

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
      precipitation_probability_max: [5, 80],
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
    precipitationProbability: 5,
    windMaxKmh: 11.2,
    windGustsKmh: 19.8,
    uvIndex: 6.2,
    weatherCode: 1,
    sunrise: '2026-08-07T06:34',
    sunset: '2026-08-07T21:22',
    utcOffsetSeconds: 7200,
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
  const jours = normalizeForecast(
    apiResponse({
      precipitation_probability_max: [null, null],
      uv_index_max: [null, null],
      windgusts_10m_max: [null, null],
      windspeed_10m_max: [null, null],
      precipitation_sum: [null, null],
    }),
  );

  for (const jour of jours) {
    for (const [champ, valeur] of Object.entries(jour)) {
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
