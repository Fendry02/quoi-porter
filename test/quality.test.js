import test from 'node:test';
import assert from 'node:assert/strict';

import { nextTier, settingsFor, SAMPLE_SIZE, TIERS } from '../js/scene/quality.js';

/** n images à `ms` millisecondes chacune. */
const frames = (ms, n = SAMPLE_SIZE) => Array.from({ length: n }, () => ms);

const FLUIDE = 16.7; // 60 images/s
const POUSSIF = 30; // 33 images/s

test('sans assez de mesures, on ne décide rien', () => {
  assert.equal(nextTier('high', frames(POUSSIF, SAMPLE_SIZE - 1)), 'high');
  assert.equal(nextTier('high', []), 'high');
});

test('un rendu fluide laisse le palier inchangé', () => {
  assert.equal(nextTier('high', frames(FLUIDE)), 'high');
  assert.equal(nextTier('medium', frames(FLUIDE)), 'medium');
});

test('un rendu poussif fait descendre d’un cran, pas de deux', () => {
  assert.equal(nextTier('high', frames(POUSSIF)), 'medium');
  assert.equal(nextTier('medium', frames(POUSSIF)), 'low');
});

test('le palier bas est un plancher', () => {
  assert.equal(nextTier('low', frames(60)), 'low');
});

test('la qualité ne remonte jamais, même si tout redevient fluide', () => {
  // Remonter provoquerait un battement visible : on remonte, ça rame, on
  // redescend, en boucle. Une dégradation à sens unique est invisible.
  assert.equal(nextTier('low', frames(8)), 'low');
  assert.equal(nextTier('medium', frames(8)), 'medium');
});

test('une seule image lente ne suffit pas à dégrader', () => {
  const presqueTouteFluide = frames(FLUIDE);
  presqueTouteFluide[10] = 400; // un à-coup isolé, un ramasse-miettes par exemple

  assert.equal(
    nextTier('high', presqueTouteFluide),
    'high',
    'un pic isolé ne doit pas coûter un palier',
  );
});

test('seules les dernières mesures comptent', () => {
  // Un mauvais début suivi d'un long passage fluide ne doit pas dégrader.
  const historique = [...frames(POUSSIF, SAMPLE_SIZE), ...frames(FLUIDE, SAMPLE_SIZE)];

  assert.equal(nextTier('high', historique), 'high');
});

test('chaque palier fournit des réglages complets et décroissants', () => {
  const reglages = TIERS.map(settingsFor);

  for (const r of reglages) {
    for (const cle of ['maxPixelRatio', 'particleScale', 'cloudLayers', 'grain']) {
      assert.ok(cle in r, `réglage manquant : ${cle}`);
    }
  }

  for (let i = 1; i < reglages.length; i++) {
    assert.ok(
      reglages[i].particleScale < reglages[i - 1].particleScale,
      'moins de particules à chaque palier',
    );
    assert.ok(reglages[i].maxPixelRatio <= reglages[i - 1].maxPixelRatio);
    assert.ok(reglages[i].cloudLayers <= reglages[i - 1].cloudLayers);
  }

  assert.equal(settingsFor('low').grain, false, 'le grain saute au palier bas');
});

test('TIERS va du plus riche au plus pauvre', () => {
  assert.deepEqual(TIERS, ['high', 'medium', 'low']);
});
