import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimeline, VIEW } from '../js/timeline.js';

/** Une journée dont le ressenti monte régulièrement, avec une averse à 19 h. */
function day(overrides = {}) {
  return {
    date: '2026-08-08',
    utcOffsetSeconds: 0,
    hours: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      temp: 10 + h * 0.6,
      feelsLike: 9 + h * 0.6,
      precipitationMm: h === 19 ? 3.2 : 0,
      precipitationProbability: h === 19 ? 80 : 5,
    })),
    ...overrides,
  };
}

const at = (jour, heure) => new Date(`2026-08-${jour}T${heure}:00Z`);

/* ------------------------------------------------------------- la fenêtre */

test('pour aujourd’hui, la fenêtre part de l’heure qu’il est', () => {
  const t = buildTimeline(day(), at('08', '15:20'));

  assert.equal(t.points[0].hour, 15, 'on ne montre pas la matinée déjà passée');
  assert.equal(t.points[t.points.length - 1].hour, 23);
});

test('pour un autre jour, la fenêtre part de 8 h', () => {
  // La date du jour ne correspond pas à celle de l'instant : c'est demain.
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '15:20'));

  assert.equal(t.points[0].hour, 8);
  assert.equal(t.points.length, 16, 'de 8 h à 23 h inclus');
});

test('la fenêtre suit l’heure DU LIEU, pas celle du navigateur', () => {
  // Même instant, deux fuseaux : la fenêtre ne peut pas commencer au même endroit.
  const surPlace = buildTimeline(day({ utcOffsetSeconds: 0 }), at('08', '10:00'));
  const plusLoin = buildTimeline(day({ utcOffsetSeconds: 5 * 3600 }), at('08', '10:00'));

  assert.equal(surPlace.points[0].hour, 10);
  assert.equal(plusLoin.points[0].hour, 15);
});

test('sous trois heures restantes, pas de courbe du tout', () => {
  // Une courbe d'un ou deux points ne dit rien : mieux vaut ne rien montrer
  // que de tracer un segment qui prétend décrire une journée.
  assert.equal(buildTimeline(day(), at('08', '23:10')), null);
  assert.equal(buildTimeline(day(), at('08', '22:30')), null);
  assert.ok(buildTimeline(day(), at('08', '21:10')), 'trois points suffisent');
});

test('sans données horaires, pas de courbe', () => {
  assert.equal(buildTimeline(day({ hours: [] }), at('08', '08:00')), null);
});

/* ------------------------------------------------------- les coordonnées */

test('les points s’étalent sur toute la largeur du repère', () => {
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00'));

  assert.equal(t.points[0].x, 0);
  assert.equal(t.points[t.points.length - 1].x, VIEW.width);

  for (const p of t.points) {
    assert.ok(p.x >= 0 && p.x <= VIEW.width, `x hors repère : ${p.x}`);
    assert.ok(p.y >= 0 && p.y <= VIEW.height, `y hors repère : ${p.y}`);
  }
});

test('le ressenti le plus chaud est le plus haut sur le tracé', () => {
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00'));

  const plusChaud = t.points.reduce((a, b) => (a.feelsLike > b.feelsLike ? a : b));
  const plusFroid = t.points.reduce((a, b) => (a.feelsLike < b.feelsLike ? a : b));

  assert.ok(plusChaud.y < plusFroid.y, 'en SVG, plus haut veut dire y plus petit');
});

test('une journée sans variation ne divise pas par zéro', () => {
  const plate = day({
    date: '2026-08-09',
    hours: Array.from({ length: 24 }, (_, h) => ({
      hour: h, temp: 18, feelsLike: 18, precipitationMm: 0, precipitationProbability: 0,
    })),
  });

  const t = buildTimeline(plate, at('08', '12:00'));

  for (const p of t.points) assert.ok(Number.isFinite(p.y), `y non fini : ${p.y}`);
});

test('le tracé est un chemin SVG qui passe par tous les points', () => {
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00'));

  assert.match(t.curve, /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+$/);
  assert.equal(t.curve.split(' ').length, t.points.length);
  assert.match(t.area, /Z$/, 'la surface sous la courbe doit être fermée');
});

/* ------------------------------------------------------------- la pluie */

test('les barres de pluie suivent la probabilité', () => {
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00'));

  const averse = t.bars.find((b) => b.hour === 19);

  assert.ok(averse, 'l’averse de 19 h doit avoir sa barre');
  assert.ok(averse.height > 0);

  for (const b of t.bars) {
    assert.ok(b.height >= 0 && b.y + b.height <= VIEW.height + 0.01, 'barre hors repère');
  }
});

test('les probabilités négligeables ne produisent pas de barre', () => {
  // Un trait de deux pixels sous chaque heure salirait le tracé sans rien
  // apprendre : 5 % de chances de pluie, ce n'est pas une information.
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00'));

  assert.equal(t.bars.find((b) => b.hour === 12), undefined, '5 % ne mérite pas de barre');
  assert.equal(t.bars.length, 1, 'seule l’averse de 19 h dépasse le seuil');
});

test('la hauteur des barres est proportionnelle à la probabilité', () => {
  const gradue = day({
    date: '2026-08-09',
    hours: day().hours.map((h) => ({
      ...h,
      precipitationProbability: h.hour === 10 ? 30 : h.hour === 14 ? 90 : 0,
    })),
  });

  const t = buildTimeline(gradue, at('08', '12:00'));
  const faible = t.bars.find((b) => b.hour === 10);
  const forte = t.bars.find((b) => b.hour === 14);

  assert.ok(Math.abs(forte.height / faible.height - 3) < 0.05, '90 % doit valoir trois fois 30 %');
});

test('une journée sans pluie ne produit aucune barre', () => {
  const sec = day({
    date: '2026-08-09',
    hours: day().hours.map((h) => ({ ...h, precipitationProbability: 0, precipitationMm: 0 })),
  });

  assert.deepEqual(buildTimeline(sec, at('08', '12:00')).bars, []);
});

/* -------------------------------------------------------- les repères */

test('les repères horaires sont espacés et lisibles', () => {
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00'));

  assert.ok(t.ticks.length >= 3 && t.ticks.length <= 5, `${t.ticks.length} repères`);
  for (const tick of t.ticks) {
    assert.match(tick.label, /^\d{1,2} h$/);
    assert.ok(tick.x >= 0 && tick.x <= VIEW.width);
  }
});

test('le pic de ressenti est signalé avec sa valeur', () => {
  const t = buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00'));

  assert.equal(t.peak.hour, 23, 'le ressenti monte jusqu’au bout dans ce jeu de test');
  assert.match(t.peak.label, /^\d+°$/);
});

test('buildTimeline ne mute pas la météo qu’on lui passe', () => {
  const weather = day();
  const copie = structuredClone(weather);

  buildTimeline(weather, at('08', '09:00'));

  assert.deepEqual(weather, copie);
});

/* ------------------------------------------------ la bande d’incertitude */

/** Journée dont chaque heure porte une enveloppe entre modèles. */
function dayWithBand(demiLargeur) {
  const base = day({ date: '2026-08-09' });
  return {
    ...base,
    hours: base.hours.map((h) => ({
      ...h,
      feelsLikeLow: h.feelsLike - demiLargeur,
      feelsLikeHigh: h.feelsLike + demiLargeur,
    })),
  };
}

test('sans enveloppe, il n’y a pas de bande', () => {
  // Le repli mono-modèle : dessiner une bande de largeur nulle laisserait
  // croire à un accord parfait alors qu'on n'a rien mesuré.
  assert.equal(buildTimeline(day({ date: '2026-08-09' }), at('08', '12:00')).band, null);
});

test('avec enveloppe, la bande est un contour fermé', () => {
  const t = buildTimeline(dayWithBand(2), at('08', '12:00'));

  assert.match(t.band, /^M[\d.]+,[\d.]+/);
  assert.match(t.band, /Z$/, 'le contour doit se refermer');
});

test('la bande encadre la courbe sans jamais la croiser', () => {
  const t = buildTimeline(dayWithBand(2), at('08', '12:00'));
  const y = (chemin) => [...chemin.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));

  const hauts = y(t.band).slice(0, t.points.length);
  const bas = y(t.band).slice(t.points.length);

  for (const [i, p] of t.points.entries()) {
    assert.ok(hauts[i] <= p.y + 0.01, `le haut de la bande passe sous la courbe en ${i}`);
    assert.ok(bas[bas.length - 1 - i] >= p.y - 0.01, `le bas passe au-dessus en ${i}`);
  }
});

test('la bande reste dans le repère', () => {
  // Une enveloppe très large ne doit pas déborder du cadre et recouvrir les
  // barres de pluie ou le libellé du pic.
  const t = buildTimeline(dayWithBand(30), at('08', '12:00'));
  const y = [...t.band.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));

  for (const v of y) assert.ok(v >= 0 && v <= VIEW.height, `y hors repère : ${v}`);
});

test('l’échelle verticale englobe l’enveloppe, pas seulement la médiane', () => {
  // Sans ça, la bande sortirait du cadre dès que les modèles divergent.
  const etroite = buildTimeline(dayWithBand(0.5), at('08', '12:00'));
  const large = buildTimeline(dayWithBand(6), at('08', '12:00'));

  assert.ok(large.range.min < etroite.range.min, 'le bas de l’échelle doit descendre');
  assert.ok(large.range.max > etroite.range.max, 'et le haut monter');
});
