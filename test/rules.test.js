import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutfit, garmentRoot, MAX_PIECES, outfitIsRobust } from '../js/rules.js';

/**
 * Journée plate : le ressenti ne bouge pas de la journée, donc le point
 * d'habillage vaut exactement ce ressenti. Indispensable pour tester les bornes
 * du barème sans que la pondération d'amplitude ne déplace le résultat.
 */
function flatDay(ressenti, overrides = {}) {
  return calmDay({ feelsLikeMin: ressenti, feelsLikeMax: ressenti, ...overrides });
}

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

test('barème de base : canicule — la réponse bouge encore au-dessus de 30°', () => {
  // Le défaut du barème précédent : un seul palier de 25 °C à l'infini, donc la
  // même tenue tout l'été. Une journée à 34 doit se distinguer d'une à 27.
  const brulant = buildOutfit(calmDay({ feelsLikeMin: 31, feelsLikeMax: 37 }));
  const chaud = buildOutfit(calmDay({ feelsLikeMin: 25, feelsLikeMax: 30 }));

  assert.deepEqual(brulant.layers.top, ['t-shirt léger']);
  assert.deepEqual(chaud.layers.top, ['t-shirt']);
  assert.equal(brulant.layers.bottom, 'short');
  assert.equal(chaud.layers.bottom, 'short');
});

test('barème de base : 22°C — t-shirt et pantalon léger', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 22 }));

  assert.deepEqual(outfit.layers.top, ['t-shirt']);
  assert.equal(outfit.layers.bottom, 'pantalon léger');
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 19°C — une chemise légère s’ajoute', () => {
  const outfit = buildOutfit(flatDay(19));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'chemise légère']);
  assert.equal(outfit.layers.bottom, 'pantalon léger');
});

test('barème de base : 16°C — t-shirt et chemise', () => {
  const outfit = buildOutfit(flatDay(16));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'chemise']);
  assert.equal(outfit.layers.bottom, 'pantalon');
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 13°C — le pull arrive, mais le fin', () => {
  const outfit = buildOutfit(flatDay(13));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull fin']);
  assert.equal(outfit.layers.bottom, 'jean');
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 10°C — pull franc, pas encore de couche extérieure', () => {
  const outfit = buildOutfit(flatDay(10));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull']);
  assert.equal(outfit.layers.outer, null);
});

test('barème de base : 7°C — pull et veste', () => {
  const outfit = buildOutfit(flatDay(7));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull']);
  assert.equal(outfit.layers.outer, 'veste');
});

test('barème de base : 2°C — pull épais et manteau', () => {
  const outfit = buildOutfit(flatDay(2));

  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull épais']);
  assert.equal(outfit.layers.outer, 'manteau');
});

test('barème de base : sous zéro — sous-couche, pantalon doublé, gants et bonnet', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: -4 }));

  assert.deepEqual(outfit.layers.top, ['sous-couche thermique', 'pull épais']);
  assert.equal(outfit.layers.bottom, 'pantalon doublé');
  assert.equal(outfit.layers.outer, 'manteau');
  assert.ok(outfit.accessories.includes('gants'));
  assert.ok(outfit.accessories.includes('bonnet'));
});

test('le grand froid se passe du t-shirt : quatre pièces, pas cinq', () => {
  // Sous une sous-couche thermique il allait de soi, et il faisait déborder la
  // tenue du seul coup d'œil qu'on est censé lui accorder.
  const outfit = buildOutfit(calmDay({ feelsLikeMin: -8 }));

  assert.equal(outfit.layers.top.includes('t-shirt'), false);
});

test('aucune tenue ne dépasse quatre pièces, par aucun temps', () => {
  // Le plafond est ce qui permet d'affiner le barème sans le transformer en
  // inventaire : la précision se gagne sur les mots, pas sur la longueur.
  for (let ressenti = -15; ressenti <= 42; ressenti += 1) {
    for (const temps of [
      {},
      { precipitationProbability: 90, precipitationMm: 9 },
      { windGustsKmh: 65 },
      { weatherCode: 71, precipitationProbability: 80, precipitationMm: 5 },
      { precipitationProbability: 90, precipitationMm: 9, windGustsKmh: 70 },
    ]) {
      const { layers } = buildOutfit(flatDay(ressenti, temps));
      const pieces = [...layers.top, layers.bottom, layers.outer].filter(Boolean);

      assert.ok(
        pieces.length <= MAX_PIECES,
        `${ressenti}° ${JSON.stringify(temps)} → ${pieces.length} pièces : ${pieces.join(', ')}`,
      );
      assert.ok(pieces.length >= 2, `${ressenti}° ne propose que ${pieces.length} pièce`);
    }
  }
});

test('la réponse bouge assez souvent pour valoir la peine d’être lue', () => {
  // Le vrai reproche fait au barème précédent : entre 25 et 45 °C il ne
  // changeait plus jamais d'avis. On compte les tenues distinctes sur la plage
  // où l'on s'habille vraiment.
  const tenues = new Set();
  for (let ressenti = 0; ressenti <= 35; ressenti += 1) {
    const { layers } = buildOutfit(flatDay(ressenti));
    tenues.add([...layers.top, layers.bottom, layers.outer].filter(Boolean).join('|'));
  }

  assert.ok(tenues.size >= 8, `seulement ${tenues.size} tenues distinctes de 0 à 35°`);
});

test('les bornes du barème sont inclusives par le bas', () => {
  // 25 appartient au palier du short, 24,9 au palier en dessous.
  assert.equal(buildOutfit(flatDay(25)).layers.bottom, 'short');
  assert.equal(buildOutfit(flatDay(24.9)).layers.bottom, 'pantalon léger');

  // 9 n'a pas encore de couche extérieure, 8,9 en a une.
  assert.equal(buildOutfit(flatDay(9)).layers.outer, null);
  assert.equal(buildOutfit(flatDay(8.9)).layers.outer, 'veste');

  // 5 est encore en veste, 4,9 passe au manteau.
  assert.equal(buildOutfit(flatDay(5)).layers.outer, 'veste');
  assert.equal(buildOutfit(flatDay(4.9)).layers.outer, 'manteau');
});

/* ------------------------------------------------------------- les pieds */

test('le moteur ne décide plus des chaussures, par aucun temps', () => {
  // Le barème des pieds a été retiré : la ligne se lisait sans jamais rien
  // apprendre à personne. Ce test tient la porte fermée — canicule, gel,
  // averse et verglas, aucun n'a le droit de ressusciter une chaussure.
  const temps = [
    flatDay(31),
    flatDay(14),
    flatDay(-6),
    flatDay(14, { precipitationProbability: 85, precipitationMm: 8 }),
    flatDay(-2, { weatherCode: 71 }),
  ];

  for (const jour of temps) {
    assert.equal(buildOutfit(jour).layers.feet, undefined);
  }
});

test('le conseil des semelles survit dans les alertes', () => {
  // Ce qui comptait vraiment n'est pas parti avec le barème : le verglas dit
  // toujours de prendre ce qui accroche, sans lister une paire.
  const outfit = buildOutfit(flatDay(-2, { weatherCode: 71 }));
  const ice = outfit.alerts.find((a) => a.kind === 'ice');

  assert.ok(ice);
  assert.match(ice.hint, /accrochent/);
});

/* ------------------------------------------- le point d'habillage pondéré */

test('la tenue se décide sur le ressenti min plus 40 % de l’amplitude', () => {
  // Une journée qui démarre à 14 et monte à 25 se vit surtout autour de 18.
  // Habiller pour 14 imposerait un pull toute la journée.
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 14, feelsLikeMax: 25 }));

  assert.equal(outfit.dressedFor, 18.4);
  assert.deepEqual(outfit.layers.top, ['t-shirt', 'chemise légère']);
  assert.equal(outfit.layers.outer, null);
});

test('sans amplitude, le point d’habillage vaut le ressenti lui-même', () => {
  const outfit = buildOutfit(flatDay(14));

  assert.equal(outfit.dressedFor, 14);
  assert.deepEqual(outfit.layers.top, ['t-shirt', 'pull fin']);
});

test('le biais reste vers le froid : on ne vise jamais le milieu de journée', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 14, feelsLikeMax: 25 }));
  const milieu = (14 + 25) / 2;

  assert.ok(
    outfit.dressedFor < milieu,
    `le point retenu (${outfit.dressedFor}) doit rester sous la moyenne (${milieu})`,
  );
  assert.ok(outfit.dressedFor > 14, 'mais au-dessus du minimum');
});

test('gants et bonnet restent liés au ressenti minimum, pas au point d’habillage', () => {
  // Point d'habillage à 0, donc pas de sous-couche — mais il fera -4 le matin
  // et les extrémités, elles, subissent bien ce minimum-là.
  const outfit = buildOutfit(calmDay({ feelsLikeMin: -4, feelsLikeMax: 6 }));

  assert.equal(outfit.dressedFor, 0);
  assert.ok(outfit.accessories.includes('gants'));
  assert.ok(outfit.accessories.includes('bonnet'));
  assert.ok(alertOfKind(outfit, 'cold'), 'l’alerte cold suit le minimum, elle aussi');
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

test('pluie chaude : le parapluie suffit, pas d’imperméable', () => {
  // Par 28°C d'habillage, enfiler un imperméable serait une étuve. On se
  // mouille un peu, ou on ouvre le parapluie.
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: 24, feelsLikeMax: 35, precipitationProbability: 80, precipitationMm: 6 }),
  );

  assert.equal(outfit.layers.outer, null);
  assert.ok(outfit.accessories.includes('parapluie'));
  assert.ok(alertOfKind(outfit, 'rain'), 'la pluie reste annoncée');
});

test('pluie tiède : l’imperméable réapparaît sous le seuil', () => {
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: 18, feelsLikeMax: 22, precipitationProbability: 80, precipitationMm: 6 }),
  );

  assert.equal(outfit.layers.outer, 'imperméable');
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

test('vent chaud : on signale les rafales sans imposer de couche', () => {
  // 40 km/h par 26°C ressentis, c'est agréable. Un coupe-vent serait absurde,
  // mais l'information reste utile.
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 23, feelsLikeMax: 30, windGustsKmh: 45 }));

  assert.equal(outfit.layers.outer, null, 'pas de couche extérieure par cette chaleur');
  assert.ok(alertOfKind(outfit, 'wind'), 'les rafales restent signalées');
});

test('vent : la couche coupe-vent n’apparaît qu’en dessous de 20°C d’habillage', () => {
  const frais = buildOutfit(flatDay(19.9, { windGustsKmh: 45 }));
  const doux = buildOutfit(flatDay(20, { windGustsKmh: 45 }));

  assert.equal(frais.layers.outer, 'coupe-vent');
  assert.equal(doux.layers.outer, null);
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

test('forte amplitude : l’alerte swing donne les deux bouts de la journée', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 8, feelsLikeMax: 22 }));
  const alert = alertOfKind(outfit, 'swing');

  assert.ok(alert, 'une alerte swing est attendue au-delà de 10°C d’amplitude ressentie');

  // Depuis qu'on habille pour un point pondéré, « prévois d'enlever une couche »
  // ne suffit plus : il faut les deux extrêmes pour que la personne juge.
  assert.match(alert.hint, /8\s*°C/, 'le ressenti le plus frais doit apparaître');
  assert.match(alert.hint, /22\s*°C/, 'le ressenti le plus chaud doit apparaître');
});

test('l’amplitude se mesure sur le ressenti, comme tout le reste du moteur', () => {
  // 14°C d'écart en température réelle, mais seulement 5 en ressenti :
  // le vent aplatit la journée, il n'y a rien à ajuster.
  const outfit = buildOutfit(
    calmDay({ tempMin: 6, tempMax: 20, feelsLikeMin: 8, feelsLikeMax: 13 }),
  );

  assert.equal(alertOfKind(outfit, 'swing'), undefined);
});

test('amplitude modérée : pas d’alerte swing', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 8, feelsLikeMax: 15 }));

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

test('neige : alerte ice', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: -2, weatherCode: 73 }));

  assert.ok(alertOfKind(outfit, 'ice'));
});

test('pluie verglaçante : traitée comme la neige', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 0, weatherCode: 67 }));

  assert.ok(alertOfKind(outfit, 'ice'));
});

test('averse de neige : l’alerte verglas s’ajoute à celle de neige', () => {
  // Averses de neige (85) avec précipitations : le modificateur pluie passe
  // avant, et les deux alertes doivent coexister sans que l’une écrase l’autre.
  const outfit = buildOutfit(
    calmDay({ feelsLikeMin: -1, weatherCode: 85, precipitationProbability: 80, precipitationMm: 4 }),
  );

  assert.ok(alertOfKind(outfit, 'ice'));
  assert.equal(alertOfKind(outfit, 'rain').label, 'Neige');
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
    calmDay({ feelsLikeMin: 8, feelsLikeMax: 22, windGustsKmh: 45, uvIndex: 8 }),
  );

  assert.ok(outfit.alerts.length >= 3, 'ce cas doit produire plusieurs hints à vérifier');

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
  assert.ok(!('feet' in outfit.layers), 'plus de chaussures dans le contrat');
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

/* ------------------------------------------------- les libellés d'alerte */

test('chaque alerte porte un libellé court', () => {
  // La frise du déroulé horaire a besoin d'un mot, pas d'une phrase. C'est le
  // moteur qui sait de quoi il parle : lui seul distingue pluie et neige.
  const outfit = buildOutfit(
    calmDay({
      feelsLikeMin: -2, feelsLikeMax: 14, weatherCode: 73,
      precipitationProbability: 90, precipitationMm: 8,
      windGustsKmh: 50, uvIndex: 8,
    }),
  );

  assert.ok(outfit.alerts.length >= 4, 'ce cas doit lever plusieurs alertes');
  for (const alert of outfit.alerts) {
    assert.equal(typeof alert.label, 'string', `${alert.kind} sans libellé`);
    // Un mot court, capitalisé, sans ponctuation : « UV » compte aussi.
    assert.match(alert.label, /^[A-ZÀ-Ý][^.]{1,12}$/, `libellé douteux : ${alert.label}`);
  }
});

test('le libellé distingue la pluie de la neige', () => {
  const pluie = buildOutfit(calmDay({ weatherCode: 63, precipitationProbability: 80, precipitationMm: 5 }));
  const neige = buildOutfit(calmDay({ feelsLikeMin: -2, weatherCode: 73, precipitationProbability: 80, precipitationMm: 5 }));

  assert.equal(alertOfKind(pluie, 'rain').label, 'Pluie');
  assert.equal(alertOfKind(neige, 'rain').label, 'Neige');
});

test('les libellés sont ceux qu’on attend', () => {
  const attendus = {
    wind: 'Vent',
    heat: 'Chaleur',
    cold: 'Gel',
    ice: 'Verglas',
    uv: 'UV',
    swing: 'Amplitude',
  };

  const froid = buildOutfit(calmDay({ feelsLikeMin: -3, feelsLikeMax: 12, weatherCode: 73, precipitationProbability: 80, precipitationMm: 5, windGustsKmh: 50 }));
  const chaud = buildOutfit(calmDay({ feelsLikeMin: 26, feelsLikeMax: 34, uvIndex: 8 }));

  for (const outfit of [froid, chaud]) {
    for (const alert of outfit.alerts) {
      if (attendus[alert.kind]) assert.equal(alert.label, attendus[alert.kind], alert.kind);
    }
  }
});

/* ------------------------------------------ la robustesse au désaccord */

test('sans désaccord mesuré, la tenue est réputée solide', () => {
  // Le repli mono-modèle ne mesure aucun désaccord : on ne va pas inventer
  // une incertitude qu'on ne sait pas évaluer.
  assert.equal(outfitIsRobust(calmDay({ feelsLikeSpread: null })), true);
});

test('un petit désaccord ne change pas la tenue', () => {
  // 12°C ± 0,5 reste au même palier : même pull, même jean.
  assert.equal(outfitIsRobust(calmDay({ feelsLikeMin: 12, feelsLikeMax: 12, feelsLikeSpread: 1 })), true);
});

test('un désaccord qui franchit un palier rend la tenue incertaine', () => {
  // 15°C d'habillage est la frontière entre « pull » et « chemise ». Un écart
  // de 4°C entre modèles place la moitié d'entre eux de chaque côté.
  assert.equal(outfitIsRobust(calmDay({ feelsLikeMin: 15, feelsLikeMax: 15, feelsLikeSpread: 4 })), false);
});

test('la robustesse se juge sur les vêtements, pas sur les degrés', () => {
  // Même écart de 4°C, mais loin de toute frontière : la tenue ne bouge pas.
  assert.equal(outfitIsRobust(calmDay({ feelsLikeMin: 32, feelsLikeMax: 32, feelsLikeSpread: 4 })), true);
});

test('outfitIsRobust ne mute pas la météo qu’on lui passe', () => {
  const weather = calmDay({ feelsLikeMin: 15, feelsLikeMax: 15, feelsLikeSpread: 4 });
  const copie = structuredClone(weather);

  outfitIsRobust(weather);

  assert.deepEqual(weather, copie);
});

/* ------------------------------------------------------ le vestiaire choisi */

test('le vestiaire féminin ouvre la jupe quand il fait doux', () => {
  const bas = buildOutfit(flatDay(26), 'femme').layers.bottom;

  assert.match(bas, /jupe/, 'la jupe doit apparaître');
  assert.match(bas, /short/, 'sans retirer le short : on propose, on n’impose pas');
});

test('la jupe s’ouvre aussi sur les journées tempérées', () => {
  assert.match(buildOutfit(flatDay(21), 'femme').layers.bottom, /jupe/);
  assert.match(buildOutfit(flatDay(16), 'femme').layers.bottom, /jupe/);
});

test('par grand froid le bas ne bouge pas : le pantalon est le bon conseil', () => {
  // Proposer une jupe à 2 °C serait un conseil, pas une option — et un mauvais.
  assert.equal(buildOutfit(flatDay(2), 'femme').layers.bottom, buildOutfit(flatDay(2)).layers.bottom);
});

test('sans profil, le vestiaire reste celui de tout le monde', () => {
  assert.equal(buildOutfit(flatDay(26)).layers.bottom, 'short');
  assert.equal(buildOutfit(flatDay(26), 'homme').layers.bottom, 'short');
});

test('le profil ne change pas le jugement de robustesse', () => {
  // outfitIsRobust compare deux tenues entre elles : le vestiaire choisi doit
  // s'appliquer aux deux ou à aucune, sinon toute journée paraîtrait incertaine.
  assert.equal(outfitIsRobust(flatDay(12, { feelsLikeSpread: 1 })), true);
});

/* ------------------------------------------------- ce qu'on emporte */

test('la forte chaleur fait emporter de quoi la tenir', () => {
  // La ligne « Avec… » ne servait qu'au parapluie et aux lunettes : onze mois
  // sur douze elle restait muette, alors que c'est exactement ce qu'on oublie
  // en partant.
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 26, feelsLikeMax: 34 }));

  assert.ok(outfit.accessories.includes('casquette'));
  assert.ok(outfit.accessories.includes('gourde'));
});

test('l’écharpe sort avant les gants, et les gants avant rien', () => {
  const frisquet = buildOutfit(calmDay({ feelsLikeMin: 3, feelsLikeMax: 9 }));
  assert.ok(frisquet.accessories.includes('écharpe'));
  assert.equal(frisquet.accessories.includes('gants'), false, 'les mains vont encore en poche');

  const gel = buildOutfit(calmDay({ feelsLikeMin: -3, feelsLikeMax: 2 }));
  assert.ok(gel.accessories.includes('écharpe'));
  assert.ok(gel.accessories.includes('gants'));
  assert.ok(gel.accessories.includes('bonnet'));
});

test('une journée tempérée n’encombre personne', () => {
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 14, feelsLikeMax: 21 }));

  assert.deepEqual(outfit.accessories, []);
});

test('les accessoires suivent les extrêmes du jour, pas le point d’habillage', () => {
  // Une matinée à 3 °C qui monte à 24 : on s'habille pour 11, mais l'écharpe se
  // glisse dans un sac et sert bien au départ.
  const outfit = buildOutfit(calmDay({ feelsLikeMin: 3, feelsLikeMax: 24 }));

  assert.ok(outfit.dressedFor > 10, 'on ne s’habille pas pour le minimum');
  assert.ok(outfit.accessories.includes('écharpe'));
});

/* ------------------------------------- la robustesse et le poids des mots */

test('un pull plus fin n’est pas une autre tenue', () => {
  // Depuis que le barème qualifie ses pièces, ses frontières sont rapprochées.
  // Comparer les noms complets faisait crier au désaccord pour un degré, tous
  // les jours ou presque : « pull » contre « pull fin », le même pull.
  assert.equal(garmentRoot('pull fin'), 'pull');
  assert.equal(garmentRoot('pull épais'), 'pull');
  assert.equal(garmentRoot('t-shirt léger'), 't-shirt');
  assert.equal(garmentRoot('pantalon doublé'), 'pantalon');

  // 13 °C donne « pull fin », 10 °C donne « pull » : un écart d'un degré à
  // cheval sur la frontière ne doit alarmer personne.
  const frontiere = calmDay({
    feelsLikeMin: 12,
    feelsLikeMax: 12,
    feelsLikeSpread: 1,
  });

  assert.equal(outfitIsRobust(frontiere), true);
});

test('un désaccord qui change vraiment la tenue reste signalé', () => {
  // Ce que la règle ne doit surtout pas avaler : franchir la frontière où la
  // couche extérieure apparaît.
  const frontiere = calmDay({
    feelsLikeMin: 9,
    feelsLikeMax: 9,
    feelsLikeSpread: 3,
  });

  assert.equal(outfitIsRobust(frontiere), false);
});
