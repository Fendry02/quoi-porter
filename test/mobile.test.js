import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWeek, widgetSnapshot } from '../js/mobile.js';

function hourlyForecast(feelsLike) {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    temp: feelsLike,
    feelsLike,
    precipitationMm: 0,
    precipitationProbability: 0,
    windGustsKmh: 10,
  }));
}

function day(index, overrides = {}) {
  const feelsLikeMin = overrides.feelsLikeMin ?? 16 + index;
  const date = `2026-08-${String(10 + index).padStart(2, '0')}`;

  return {
    date,
    tempMin: feelsLikeMin,
    tempMax: feelsLikeMin + 5,
    feelsLikeMin,
    feelsLikeMax: feelsLikeMin + 5,
    precipitationMm: 0,
    precipitationProbability: 0,
    windMaxKmh: 10,
    windGustsKmh: 10,
    uvIndex: 2,
    weatherCode: 1,
    utcOffsetSeconds: 0,
    hours: hourlyForecast(feelsLikeMin),
    ...overrides,
  };
}

const MORNING = new Date('2026-08-10T08:00:00Z');

test('la semaine mobile garde les sept premiers jours et prépare leur recommandation complète', () => {
  const week = buildWeek(Array.from({ length: 8 }, (_, index) => day(index)), MORNING);

  assert.equal(week.length, 7);
  assert.equal(week[0].isToday, true);
  assert.equal(week[1].isToday, false);
  assert.equal(week[0].id, '2026-08-10');
  assert.match(week[0].phrasing.wear, /t-shirt/i);
  assert.equal(week[0].outfit.layers.bottom, 'pantalon');
});

test('le widget résume le lieu, la tenue, la plage de température et le risque principal', () => {
  const [today] = buildWeek(
    [
      day(0, {
        feelsLikeMin: 11,
        feelsLikeMax: 17,
        precipitationProbability: 80,
        precipitationMm: 5,
      }),
    ],
    MORNING,
  );

  const snapshot = widgetSnapshot(today, 'Paris, Île-de-France, France');

  assert.equal(snapshot.place, 'Paris');
  assert.match(snapshot.outfit, /imperméable/i);
  assert.equal(snapshot.temperature, '11–17°');
  assert.match(snapshot.attention, /pluie/i);
});

test('le widget ne crée pas de fausse alerte quand la journée est sans risque', () => {
  const [today] = buildWeek([day(0)], MORNING);

  assert.equal(widgetSnapshot(today, 'Nantes, Pays de la Loire, France').attention, null);
});
