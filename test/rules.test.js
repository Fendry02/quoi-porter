import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutfit } from '../js/rules.js';

/**
 * Construit un DayWeather calme : pas de pluie, pas de vent, pas d'UV.
 * Les tests du barème de base peuvent ainsi isoler l'effet de la température.
 */
function calmDay(overrides = {}) {
  const feelsLikeMin = overrides.feelsLikeMin ?? 12;
  return {
    date: '2026-08-07',
    tempMin: feelsLikeMin,
    tempMax: feelsLikeMin + 5,
    feelsLikeMin,
    feelsLikeMax: feelsLikeMin + 5,
    precipitationMm: 0,
    precipitationProbability: 0,
    windMaxKmh: 5,
    windGustsKmh: 10,
    uvIndex: 2,
    weatherCode: 1,
    ...overrides,
  };
}

test('barème de base : canicule — t-shirt seul et short', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 27, feelsLikeMax: 32 }));

  assert.deepEqual(outfit.layers.top, ['t-shirt']);
  assert.equal(outfit.layers.bottom, 'short');
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 22°C — t-shirt et pantalon léger', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 22 }));

  assert.deepEqual(outfit.layers.top, ['t-shirt']);
  assert.equal(outfit.layers.bottom, 'pantalon léger');
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 17°C — t-shirt et chemise', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 17 }));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'chemise']);
  assert.equal(outfit.layers.bottom, 'pantalon');
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 12°C — pull, mais pas encore de couche extérieure', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 12 }));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull']);
  assert.equal(outfit.layers.bottom, 'jean');
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 7°C — pull et veste', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 7 }));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull']);
  assert.equal(outfit.layers.outer, 'veste');
  assert.equal(outfit.layers.feet, 'baskets');
});

test('barème de base : 2°C — manteau et chaussures fermées', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 2 }));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull']);
  assert.equal(outfit.layers.outer, 'manteau');
  assert.equal(outfit.layers.feet, 'chaussures fermées');
});

test('barème de base : sous zéro — sous-couche, gants et bonnet', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: -4 }));

  assert.deepEqual(outfit.layers.top, ['sous-couche thermique', 't-shirt', 'pull']);
  assert.equal(outfit.layers.outer, 'manteau');
  assert.ok(outfit.accessories.includes('gants'));
  assert.ok(outfit.accessories.includes('bonnet'));
});

test('les bornes du barème sont inclusives par le bas', () => {
  // 25 appartient au palier canicule, 24,9 au palier en dessous.
  assert.equal(buildOutfit(calmDay({ feelsLikeMin: 25 })).layers.bottom, 'short');
  assert.equal(buildOutfit(calmDay({ feelsLikeMin: 24.9 })).layers.bottom, 'pantalon léger');

  // 10 n'a pas encore de couche extérieure, 9,9 en a une.
  assert.equal(buildOutfit(calmDay({ feelsLikeMin: 10 })).layers.outer, null);
  assert.equal(buildOutfit(calmDay({ feelsLikeMin: 9.9 })).layers.outer, 'veste');

  // 5 est encore en veste, 4,9 passe au manteau.
  assert.equal(buildOutfit(calmDay({ feelsLikeMin: 5 })).layers.outer, 'veste');
  assert.equal(buildOutfit(calmDay({ feelsLikeMin: 4.9 })).layers.outer, 'manteau');
});

function alertOfKind(outfit, kind) {
  return outfit.alerts.find((a) => a.kind === kind);
}

test('gel : une alerte cold en severity high', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: -4, feelsLikeMax: 1 }));
  const alert = alertOfKind(outfit, 'cold');

  assert.ok(alert, 'une alerte cold est attendue sous 0°C ressentis');
  assert.equal(alert.severity, 'high');
  assert.ok(alert.hint.length > 0);
});

test('canicule : une alerte heat, qui passe en high au-delà de 35°C', () => {
  const chaud = buildOutfit(calmDay({ feelsLikeMin: 24, feelsLikeMax: 31 }));
  assert.equal(alertOfKind(chaud, 'heat').severity, 'medium');

  const brulant = buildOutfit(calmDay({ feelsLikeMin: 27, feelsLikeMax: 37 }));
  assert.equal(alertOfKind(brulant, 'heat').severity, 'high');
});

test('journée tempérée : aucune alerte de température', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 14, feelsLikeMax: 21 }));

  assert.equal(alertOfKind(outfit, 'cold'), undefined);
  assert.equal(alertOfKind(outfit, 'heat'), undefined);
});

test('pluie probable : imperméable et parapluie', () => {
  const outfit = buildOutfit(calmDay({ precipitationProbability: 70, precipitationMm: 4 }));

  assert.equal(outfit.layers.outer, 'imperméable');
  assert.ok(outfit.accessories.includes('parapluie'));
  assert.equal(alertOfKind(outfit, 'rain').severity, 'high');
});

test('pluie : le cumul déclenche même quand la probabilité est basse', () => {
  const outfit = buildOutfit(calmDay({ precipitationProbability: 20, precipitationMm: 3 }));

  assert.equal(outfit.layers.outer, 'imperméable');
  assert.ok(outfit.accessories.includes('parapluie'));
});

test('pluie : sous les seuils, rien ne change', () => {
  const outfit = buildOutfit(calmDay({ precipitationProbability: 30, precipitationMm: 0.4 }));

  assert.equal(outfit.layers.outer, null);
  assert.ok(!outfit.accessories.includes('parapluie'));
  assert.equal(alertOfKind(outfit, 'rain'), undefined);
});

test('vent : une couche coupe-vent apparaît quand il n’y en avait pas', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 16, windGustsKmh: 45 }));

  assert.equal(outfit.layers.outer, 'coupe-vent');
  assert.equal(alertOfKind(outfit, 'wind').severity, 'medium');
});

test('vent : un manteau déjà présent est conservé, il coupe déjà le vent', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 2, windGustsKmh: 45 }));

  assert.equal(outfit.layers.outer, 'manteau');
});

test('vent fort ET pluie : le parapluie est retiré', () => {
  const outfit = buildOutfit(
    calmDay({ precipitationProbability: 80, precipitationMm: 5, windGustsKmh: 70 }),
  );

  assert.equal(outfit.layers.outer, 'imperméable', 'l’imperméable reste, lui');
  assert.ok(
    !outfit.accessories.includes('parapluie'),
    'un parapluie est inutilisable à 70 km/h de rafales',
  );

  const wind = alertOfKind(outfit, 'wind');
  assert.equal(wind.severity, 'high');
  assert.match(wind.hint, /parapluie/i, 'l’alerte doit expliquer pourquoi il n’y a pas de parapluie');
});

test('vent fort sans pluie : pas de mention du parapluie', () => {
  const outfit = buildOutfit(calmDay({ windGustsKmh: 70 }));

  assert.equal(alertOfKind(outfit, 'wind').severity, 'high');
  assert.ok(!outfit.accessories.includes('parapluie'));
});

test('forte amplitude : une alerte swing invite à pouvoir enlever une couche', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 8, tempMin: 6, tempMax: 20 }));
  const alert = alertOfKind(outfit, 'swing');

  assert.ok(alert, 'une alerte swing est attendue au-delà de 10°C d’amplitude');
  assert.ok(alert.hint.length > 0);
});

test('amplitude modérée : pas d’alerte swing', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 8, tempMin: 6, tempMax: 15 }));

  assert.equal(alertOfKind(outfit, 'swing'), undefined);
});

test('UV élevé : lunettes et alerte uv', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 24, uvIndex: 8 }));

  assert.ok(outfit.accessories.includes('lunettes'));
  assert.ok(alertOfKind(outfit, 'uv'));
});

test('UV faible : ni lunettes ni alerte', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 24, uvIndex: 5 }));

  assert.ok(!outfit.accessories.includes('lunettes'));
  assert.equal(alertOfKind(outfit, 'uv'), undefined);
});

test('neige : chaussures adhérentes et alerte ice', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: -2, weatherCode: 73 }));

  assert.equal(outfit.layers.feet, 'chaussures adhérentes');
  assert.ok(alertOfKind(outfit, 'ice'));
});

test('pluie verglaçante : traitée comme la neige', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 0, weatherCode: 67 }));

  assert.equal(outfit.layers.feet, 'chaussures adhérentes');
  assert.ok(alertOfKind(outfit, 'ice'));
});

test('la neige prime sur la pluie pour les chaussures', () => {
  // Averses de neige (85) avec précipitations : le modificateur pluie passe
  // avant, mais ce sont bien les chaussures adhérentes qui doivent rester.
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: -1, weatherCode: 85, precipitationProbability: 80, precipitationMm: 4 }),
  );

  assert.equal(outfit.layers.feet, 'chaussures adhérentes');
  assert.equal(outfit.layers.outer, 'manteau', 'par -1°C on garde le manteau');
});

test('neige : pas de parapluie, et l’alerte parle de neige et non de pluie', () => {
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: -2, weatherCode: 73, precipitationProbability: 80, precipitationMm: 5 }),
  );

  assert.ok(
    !outfit.accessories.includes('parapluie'),
    'on ne sort pas un parapluie sous la neige',
  );

  const rain = alertOfKind(outfit, 'rain');
  assert.ok(rain, 'des précipitations restent des précipitations');
  assert.match(rain.hint, /neige|neiger/i);
  assert.doesNotMatch(rain.hint, /pleuvoir|pluie/i);
});

test('pluie verglaçante : le parapluie reste pertinent', () => {
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: 0, weatherCode: 67, precipitationProbability: 80, precipitationMm: 5 }),
  );

  assert.ok(outfit.accessories.includes('parapluie'));
});

test('pluie par grand froid : le manteau n’est pas dégradé en imperméable', () => {
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: -5, precipitationProbability: 80, precipitationMm: 5, weatherCode: 63 }),
  );

  assert.equal(
    outfit.layers.outer,
    'manteau',
    'un imperméable seul ne tient pas chaud par -5°C ressentis',
  );
  assert.ok(outfit.accessories.includes('parapluie'), 'la pluie est gérée par le parapluie');
});

test('les hints utilisent une espace insécable devant les unités', () => {
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: 8, tempMin: 6, tempMax: 20, windGustsKmh: 45, uvIndex: 8 }),
  );

  for (const alert of outfit.alerts) {
    assert.doesNotMatch(
      alert.hint,
      / (°C|km\/h)/,
      `espace sécable devant l’unité dans : ${alert.hint}`,
    );
  }
});

test('l’Outfit produit est conforme au contrat', () => {
  const outfit = buildOutfit(calmDay());

  assert.ok(Array.isArray(outfit.layers.top));
  assert.equal(typeof outfit.layers.bottom, 'string');
  assert.equal(typeof outfit.layers.feet, 'string');
  assert.ok(Array.isArray(outfit.accessories));
  assert.ok(Array.isArray(outfit.alerts));

  const kinds = ['rain', 'wind', 'swing', 'uv', 'ice', 'cold', 'heat'];
  const severities = ['low', 'medium', 'high'];
  for (const alert of outfit.alerts) {
    assert.ok(kinds.includes(alert.kind), `kind inattendu : ${alert.kind}`);
    assert.ok(severities.includes(alert.severity), `severity inattendue : ${alert.severity}`);
  }
});

test('buildOutfit ne mute pas la météo qu’on lui passe', () => {
  const weather = calmDay({ feelsLikeMin: -4, precipitationProbability: 90, windGustsKmh: 70 });
  const copie = structuredClone(weather);

  buildOutfit(weather);

  assert.deepEqual(weather, copie);
});

export { calmDay, alertOfKind };
