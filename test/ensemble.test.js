import test from 'node:test';
import assert from 'node:assert/strict';

import { median, pool, spread, acrossModels } from '../js/ensemble.js';

/* ------------------------------------------------------------ la médiane */

test('la médiane d’un nombre impair de valeurs est celle du milieu', () => {
  assert.equal(median([3, 1, 2]), 2);
});

test('la médiane d’un nombre pair est la moyenne des deux du milieu', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('les modèles muets sont ignorés, pas comptés pour zéro', () => {
  // Météo-France et UKMO ne fournissent pas la probabilité de pluie : les
  // compter comme des zéros ferait plonger la médiane.
  assert.equal(median([80, null, 90, undefined, 70]), 80);
});

test('sans aucune valeur, la médiane est nulle', () => {
  assert.equal(median([]), null);
  assert.equal(median([null, undefined]), null);
});

test('une seule valeur reste elle-même', () => {
  assert.equal(median([42, null]), 42);
});

/* --------------------------------------------------- la mise en commun */

test('la mise en commun est la moyenne des modèles qui parlent', () => {
  assert.equal(pool([0, 42, 3]), 15);
});

test('la mise en commun ignore les modèles muets, comme la médiane', () => {
  assert.equal(pool([60, null, 40, undefined]), 50);
});

test('sans aucune valeur, la mise en commun est nulle', () => {
  assert.equal(pool([]), null);
  assert.equal(pool([null, undefined]), null);
});

test('la mise en commun garde la voix d’une minorité que la médiane efface', () => {
  // Le cœur du problème : un seul modèle annonçant 90 % de pluie à cette heure
  // est réduit au silence par la médiane, alors qu'il décrit un vrai risque.
  assert.equal(median([0, 90, 0]), 0);
  assert.equal(pool([0, 90, 0]), 30);
});

/* ------------------------------------------------------------ l’étendue */

test('l’étendue donne les deux extrêmes', () => {
  assert.deepEqual(spread([12, 15, 13, 18]), { low: 12, high: 18 });
});

test('l’étendue ignore les modèles muets', () => {
  assert.deepEqual(spread([12, null, 18]), { low: 12, high: 18 });
});

test('un seul modèle ne produit pas d’étendue : il n’y a rien à comparer', () => {
  assert.equal(spread([12]), null);
  assert.equal(spread([12, null, null]), null);
  assert.equal(spread([]), null);
});

/* --------------------------------------------- la lecture des colonnes */

test('acrossModels rassemble une variable sur tous les modèles', () => {
  // Open-Meteo suffixe chaque champ par le nom du modèle.
  const bloc = {
    temperature_2m_gfs_seamless: [10, 11],
    temperature_2m_icon_seamless: [12, 13],
    temperature_2m_ecmwf_ifs025: [14, 15],
  };

  assert.deepEqual(
    acrossModels(bloc, 'temperature_2m', ['gfs_seamless', 'icon_seamless', 'ecmwf_ifs025'], 1),
    [11, 13, 15],
  );
});

test('acrossModels rend undefined pour un modèle absent du bloc', () => {
  const bloc = { temperature_2m_gfs_seamless: [10] };

  assert.deepEqual(acrossModels(bloc, 'temperature_2m', ['gfs_seamless', 'absent'], 0), [10, undefined]);
});

test('acrossModels supporte un bloc sans suffixe, pour le repli mono-modèle', () => {
  // Quand la requête d'ensemble échoue, on refait une requête simple : les
  // champs n'ont alors plus de suffixe.
  const bloc = { temperature_2m: [21, 22] };

  assert.deepEqual(acrossModels(bloc, 'temperature_2m', [], 1), [22]);
});
