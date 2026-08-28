import test from 'node:test';
import assert from 'node:assert/strict';

import { relevantHours, spanOf, peakOf, phraseSpan, phraseHour, shortSpan, dayLabel } from '../js/hours.js';

function day(overrides = {}) {
  return {
    date: '2026-08-08',
    utcOffsetSeconds: 0,
    hours: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      temp: 12,
      feelsLike: 12,
      precipitationMm: 0,
      precipitationProbability: 0,
      windGustsKmh: 10,
    })),
    ...overrides,
  };
}

/** Remplace une plage d'heures par des valeurs données. */
function withHours(base, from, to, patch) {
  return {
    ...base,
    hours: base.hours.map((h) => (h.hour >= from && h.hour <= to ? { ...h, ...patch } : h)),
  };
}

const at = (jour, heure) => new Date(`2026-08-${jour}T${heure}:00Z`);

/* ------------------------------------------------------------ la fenêtre */

test('pour aujourd’hui, la fenêtre part de l’heure qu’il est', () => {
  const heures = relevantHours(day(), at('08', '15:20'));

  assert.equal(heures[0].hour, 15);
  assert.equal(heures[heures.length - 1].hour, 23);
});

test('pour un autre jour, la fenêtre part du matin', () => {
  const heures = relevantHours(day({ date: '2026-08-09' }), at('08', '15:20'));

  assert.equal(heures[0].hour, 8);
  assert.equal(heures.length, 16);
});

test('la fenêtre suit l’heure du lieu, pas celle du navigateur', () => {
  const surPlace = relevantHours(day({ utcOffsetSeconds: 0 }), at('08', '10:00'));
  const plusLoin = relevantHours(day({ utcOffsetSeconds: 5 * 3600 }), at('08', '10:00'));

  assert.equal(surPlace[0].hour, 10);
  assert.equal(plusLoin[0].hour, 15);
});

test('sans données horaires, la fenêtre est vide', () => {
  assert.deepEqual(relevantHours(day({ hours: [] }), at('08', '08:00')), []);
});

/* -------------------------------------------------------------- les plages */

test('spanOf trouve le début et la fin de ce qui vérifie la condition', () => {
  const pluvieux = withHours(day(), 16, 19, { precipitationProbability: 80 });
  const heures = relevantHours(pluvieux, at('08', '08:00'));

  assert.deepEqual(spanOf(heures, (h) => h.precipitationProbability >= 40), { from: 16, to: 19 });
});

test('spanOf couvre du premier au dernier, même si le milieu retombe', () => {
  // Deux averses séparées : on annonce la période entière plutôt que d'énumérer
  // des créneaux — « de 14 h à 20 h » se retient, « 14-15 h et 19-20 h » non.
  let w = withHours(day(), 14, 15, { precipitationProbability: 80 });
  w = withHours(w, 19, 20, { precipitationProbability: 80 });

  const heures = relevantHours(w, at('08', '08:00'));
  assert.deepEqual(spanOf(heures, (h) => h.precipitationProbability >= 40), { from: 14, to: 20 });
});

test('spanOf rend null quand rien ne vérifie la condition', () => {
  const heures = relevantHours(day(), at('08', '08:00'));

  assert.equal(spanOf(heures, (h) => h.precipitationProbability >= 40), null);
});

/* ---------------------------------------------------------------- les pics */

test('peakOf trouve l’heure de la valeur la plus haute', () => {
  const chaud = withHours(day(), 15, 15, { feelsLike: 31 });
  const heures = relevantHours(chaud, at('08', '08:00'));

  assert.deepEqual(peakOf(heures, (h) => h.feelsLike), { hour: 15, value: 31 });
});

test('peakOf rend null sur une fenêtre vide', () => {
  assert.equal(peakOf([], (h) => h.feelsLike), null);
});

/* ------------------------------------------------------- la mise en mots */

test('une plage d’une heure se dit « vers »', () => {
  assert.equal(phraseSpan({ from: 17, to: 17 }, { from: 8, to: 23 }), 'vers 17 h');
});

test('une plage courte se dit avec ses deux bornes', () => {
  assert.equal(phraseSpan({ from: 16, to: 19 }, { from: 8, to: 23 }), 'de 16 h à 19 h');
});

test('une plage qui court jusqu’au bout se dit « à partir de »', () => {
  assert.equal(phraseSpan({ from: 18, to: 23 }, { from: 8, to: 23 }), 'à partir de 18 h');
});

test('une plage qui démarre au début se dit « jusqu’à »', () => {
  assert.equal(phraseSpan({ from: 8, to: 12 }, { from: 8, to: 23 }), 'jusqu’à 12 h');
});

test('une plage qui couvre tout se dit « toute la journée »', () => {
  assert.equal(phraseSpan({ from: 8, to: 23 }, { from: 8, to: 23 }), 'toute la journée');
});

test('une heure seule se dit « vers »', () => {
  assert.equal(phraseHour(15), 'vers 15 h');
});

test('minuit se dit proprement', () => {
  assert.equal(phraseHour(0), 'vers 0 h');
  assert.equal(phraseSpan({ from: 22, to: 23 }, { from: 8, to: 23 }), 'à partir de 22 h');
});

/* ------------------------------------------------- l'horodatage de la frise */

/**
 * On écrit l'insécable en échappement : collé dans le code, il est invisible
 * et indiscernable d'une espace ordinaire — de quoi passer une heure à chercher
 * pourquoi deux chaînes identiques à l'œil ne le sont pas.
 */
const NBSP = '\u00A0';

test('un instant se marque d’une seule heure', () => {
  assert.equal(shortSpan({ from: 17, to: 17 }), `17${NBSP}h`);
});

test('une plage se marque de ses deux bornes, l’unité une seule fois', () => {
  // « 14 h – 18 h » doublerait l'unité dans une légende qui doit tenir contre
  // une barre : on ne l'écrit qu'une fois, au bout.
  assert.equal(shortSpan({ from: 14, to: 18 }), `14–18${NBSP}h`);
});

test('l’horodatage ne se coupe jamais en fin de ligne', () => {
  // Une légende posée sur l'axe se replierait sous sa barre si le navigateur
  // pouvait couper avant l'unité — le tiret cadratin est déjà insécable ici.
  assert.equal(shortSpan({ from: 14, to: 18 }).includes('\u0020'), false, 'espace sécable');
  assert.equal(shortSpan({ from: 17, to: 17 }).includes('\u0020'), false, 'espace sécable');
});

test('minuit se dit 0 h, pas rien', () => {
  assert.equal(shortSpan({ from: 0, to: 3 }), `0–3${NBSP}h`);
});

test('le libellé d’une journée nomme le jour, le mois, et dit « aujourd’hui »', () => {
  assert.equal(dayLabel('2026-09-09', false), 'mer. 9 sept.');
  assert.equal(dayLabel('2026-09-09', true), 'Aujourd’hui');
});

test('le libellé ne bascule pas sur le jour voisin selon le fuseau du lecteur', () => {
  // La date est déjà locale au lieu : la lire à minuit ferait basculer d'un jour
  // dans un fuseau négatif. D'où l'heure de midi dans la conversion.
  assert.match(dayLabel('2026-01-01', false), /1 janv\./);
});