import test from 'node:test';
import assert from 'node:assert/strict';

import { conditionLabel, weatherPalette } from '../js/mobile-presentation.js';

test('les codes météo deviennent des conditions lisibles dans l’app', () => {
  assert.equal(conditionLabel(1), 'Ciel dégagé');
  assert.equal(conditionLabel(63), 'Pluie');
  assert.equal(conditionLabel(73), 'Neige');
  assert.equal(conditionLabel(95), 'Orage');
});

test('la palette reste lisible lorsque le ciel s’assombrit', () => {
  const rain = weatherPalette(63, 'light');
  const storm = weatherPalette(95, 'dark');

  assert.equal(rain.ink, '#10242F');
  assert.equal(storm.ink, '#F3F7FA');
  assert.notEqual(rain.background, storm.background);
});
