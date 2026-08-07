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
      ...overrides,
    },
  };
}

test('normalise un jour par entrée du tableau time', () => {
  const jours = normalizeForecast(apiResponse());

  assert.equal(jours.length, 2);
  assert.equal(jours[0].date, '2026-08-07');
  assert.equal(jours[1].date, '2026-08-08');
});

test('reporte chaque champ de l’API sur le bon champ du contrat', () => {
  const [jour] = normalizeForecast(apiResponse());

  assert.deepEqual(jour, {
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
  });
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
