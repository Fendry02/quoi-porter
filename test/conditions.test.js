import test from 'node:test';
import assert from 'node:assert/strict';

import { familyOf, consensusCode } from '../js/conditions.js';

/* ------------------------------------------------------------ les familles */

test('chaque code WMO tombe dans sa famille', () => {
  assert.equal(familyOf(0), 'clear');
  assert.equal(familyOf(3), 'cloud');
  assert.equal(familyOf(45), 'cloud');
  assert.equal(familyOf(51), 'rain');
  assert.equal(familyOf(63), 'rain');
  assert.equal(familyOf(73), 'snow');
  assert.equal(familyOf(95), 'storm');
});

test('un code inconnu passe pour dégagé plutôt que d’inventer une alerte', () => {
  assert.equal(familyOf(999), 'clear');
});

/* ------------------------------------------------------------ le consensus */

test('l’avis majoritaire l’emporte sur l’ordre des modèles', () => {
  // Le vrai cas de Paris : ECMWF, premier du tableau, annonçait de la bruine
  // quand trois modèles sur cinq disaient couvert. Arriver en tête d'un
  // tableau n'est pas un argument météorologique.
  const avis = consensusCode([55, 3, 3, 3, 51]);

  assert.equal(avis.family, 'cloud');
  assert.equal(avis.code, 3);
  assert.equal(avis.agreeing, 3);
  assert.equal(avis.total, 5);
});

test('ce sont les familles qui votent, pas les codes bruts', () => {
  // Lyon : bruine, bruine, couvert, couvert, pluie. Compter les codes un à un
  // donnerait « couvert » (deux voix) alors que trois modèles sur cinq
  // attendent de l'eau.
  const avis = consensusCode([51, 53, 3, 3, 63]);

  assert.equal(avis.family, 'rain');
});

test('les modèles muets ne votent pas', () => {
  const avis = consensusCode([null, 3, 3, undefined]);

  assert.equal(avis.family, 'cloud');
  assert.equal(avis.total, 2, 'seuls les modèles qui parlent comptent');
});

test('à égalité, le plus sévère l’emporte', () => {
  // Deux voix chacun : mieux vaut proposer un imperméable inutile qu'oublier
  // celui dont on avait besoin.
  assert.equal(consensusCode([3, 3, 63, 63]).family, 'rain');
});

test('un avis minoritaire nettement plus grave est signalé', () => {
  // Nice : bruine, pluie, couvert, couvert, orage. Pluie et couvert sont à
  // deux voix ; la sévérité tranche pour la pluie, et trois modèles sur cinq
  // attendent bien quelque chose. Reste l'orage d'UKMO : taire le seul modèle
  // qui annonce nettement pire serait malhonnête.
  const avis = consensusCode([51, 63, 3, 3, 95]);

  assert.equal(avis.family, 'rain');
  assert.deepEqual(avis.dissent, { family: 'storm', code: 95, count: 1, total: 5 });
});

test('une minorité d’un seul cran ne mérite pas de réserve', () => {
  // Paris : couvert contre bruine. Deux familles voisines, et le signaler à
  // chaque fois noierait les réserves qui comptent vraiment.
  assert.equal(consensusCode([55, 3, 3, 3, 51]).dissent, null);
});

test('une minorité moins grave que le consensus ne se signale pas', () => {
  // Annoncer « attention, un modèle prévoit moins pire » n'aide personne.
  assert.equal(consensusCode([63, 63, 63, 3]).dissent, null);
});

test('sans aucun avis, il n’y a pas de consensus', () => {
  assert.equal(consensusCode([]), null);
  assert.equal(consensusCode([null, undefined]), null);
});
