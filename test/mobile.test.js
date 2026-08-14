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

test('le vestiaire choisi traverse toute la semaine', () => {
  // Le profil se demande une fois ; il doit valoir pour les sept jours, pas
  // seulement pour celui qu'on regarde en premier.
  const semaine = buildWeek([day(0, { feelsLikeMin: 26 }), day(1, { feelsLikeMin: 26 })], new Date('2026-08-10T08:00:00Z'), 'femme');

  for (const jour of semaine) {
    assert.match(jour.outfit.layers.bottom, /jupe/, `${jour.date} doit proposer la jupe`);
  }
});

test('sans profil, la semaine garde le vestiaire commun', () => {
  const semaine = buildWeek([day(0, { feelsLikeMin: 26 })], new Date('2026-08-10T08:00:00Z'));

  assert.equal(semaine[0].outfit.layers.bottom, 'short');
});

/* ------------------------------------------------- aujourd'hui et la veille */

test('la semaine commence à aujourd’hui, même quand la veille est fournie', () => {
  // Dès qu'on demande la veille pour comparer, elle arrive en tête du tableau.
  // Supposer que l'entrée 0 est aujourd'hui décalerait toute la semaine d'un
  // cran, et « Aujourd'hui » désignerait hier.
  const hier = day(-1, { feelsLikeMin: 22 });
  const semaine = buildWeek([hier, day(0), day(1)], MORNING);

  assert.equal(semaine[0].id, '2026-08-10');
  assert.equal(semaine[0].isToday, true);
  assert.equal(semaine.length, 2, 'la veille ne fait pas partie de la semaine');
});

test('la comparaison avec hier ne vaut que pour aujourd’hui', () => {
  const hier = day(-1, { feelsLikeMin: 22 });
  const semaine = buildWeek([hier, day(0, { feelsLikeMin: 14 }), day(1)], MORNING);

  assert.match(semaine[0].phrasing.versusYesterday, /moins qu’hier/);
  assert.equal(semaine[1].phrasing.versusYesterday, null, 'demain ne se compare pas à hier');
});

test('sans veille fournie, on ne compare pas et la semaine ne bouge pas', () => {
  const semaine = buildWeek([day(0), day(1)], MORNING);

  assert.equal(semaine[0].id, '2026-08-10');
  assert.equal(semaine[0].phrasing.versusYesterday, null);
});

test('une date d’aujourd’hui introuvable ne fait pas perdre la semaine', () => {
  // Prévision périmée, ou fuseau qui décale : mieux vaut afficher le premier
  // jour connu qu'un écran vide.
  const semaine = buildWeek([day(3), day(4)], MORNING);

  assert.equal(semaine.length, 2);
  assert.equal(semaine[0].id, '2026-08-13');
});

test('l’avis pour la suite de la journée ne concerne qu’aujourd’hui', () => {
  // « Prends une veste pour ce soir » sous un titre DEMAIN ne voudrait rien dire.
  const froidLeSoir = (index) => ({
    ...day(index),
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      temp: hour >= 18 ? 4 : 21,
      feelsLike: hour >= 18 ? 4 : 21,
      precipitationMm: 0,
      precipitationProbability: 0,
      windGustsKmh: 8,
    })),
    feelsLikeMin: 4,
    feelsLikeMax: 21,
  });

  const semaine = buildWeek([froidLeSoir(0), froidLeSoir(1)], new Date('2026-08-10T06:00:00Z'));

  assert.match(semaine[0].phrasing.later, /soir/i);
  assert.equal(semaine[1].phrasing.later, null);
});

test('aujourd’hui introuvable ne fait jamais retomber sur la veille', () => {
  // Depuis qu'on demande la veille pour comparer, le tableau commence par elle.
  // Un repli sur l'entrée 0 afficherait donc la tenue d'hier — y compris dans
  // le widget, qui lit le premier jour de la semaine.
  const semaine = buildWeek([day(-1), day(1)], MORNING);

  assert.equal(semaine[0].id, '2026-08-11', 'on avance, on ne recule pas');
  assert.equal(semaine[0].isToday, true, 'le jour le plus proche tient lieu d’aujourd’hui');
});
