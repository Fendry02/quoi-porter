/**
 * Le déroulé de la journée : (DayWeather, instant) → géométrie du tracé.
 *
 * Module pur. Il décide quelles heures montrer et où placer chaque point dans
 * un repère normalisé ; `render.js` se contente ensuite d'en faire du SVG.
 *
 * C'est lui qui répond à la question que la phrase seule ne peut pas traiter :
 * « 31 °C mais un peu de pluie » ne veut rien dire tant qu'on ne sait pas
 * quand tombe l'averse.
 */

import { relevantHours } from './hours.js';

/** Repère normalisé du tracé. Le SVG s'y adapte par son viewBox. */
export const VIEW = { width: 100, height: 34 };

/**
 * Part de la largeur réservée, à droite, aux degrés de l'échelle.
 *
 * Le tracé s'arrête donc avant le bord. C'est le prix d'une échelle lisible :
 * posés sur le dessin, les nombres tombaient sur la courbe un jour sur deux, et
 * une échelle qu'on ne peut pas lire ne vaut pas la place qu'elle prend.
 */
const GUTTER = 13;

/** Largeur du tracé lui-même, l'échelle exclue. */
export const PLOT_WIDTH = VIEW.width - GUTTER;

/** Hauteur réservée aux barres de pluie, en bas du repère. */
const RAIN_BAND = 11;

/** Marge haute, pour que le pic ne touche pas le bord. */
const TOP_PAD = 3;

/** En dessous, une courbe ne décrit plus rien. */
const MIN_POINTS = 3;

/**
 * Au-delà de ce nombre d'heures affichées, on n'étiquette plus qu'une
 * graduation sur deux : les nombres se chevaucheraient sur un écran étroit.
 * Seize heures — la fenêtre d'une journée entière vue le matin — tiennent ;
 * les vingt-quatre d'une page ouverte à minuit, non.
 */
const LABEL_CROWD = 18;

/**
 * Pas possibles de l'échelle des degrés, du plus fin au plus large.
 *
 * On prend le premier qui tienne l'amplitude du jour en quatre lignes au plus :
 * au-delà, les traits se serrent sur une courbe qui fait quatre-vingt-dix
 * pixels de haut, et l'échelle devient une trame. Les valeurs sont rondes par
 * construction — 20°, 25° — parce qu'on lit mieux un repère qu'on aurait pu
 * choisir soi-même qu'un 17,4° exact dont on n'a rien à faire.
 */
const NICE_STEPS = [1, 2, 5, 10];

/** Nombre maximum de lignes de niveau. */
const MAX_LEVELS = 4;

const round = (n) => Math.round(n * 100) / 100;

/** Le pas de l'échelle : le plus fin qui tienne en MAX_LEVELS lignes. */
function niceStep(min, max) {
  const lignes = (pas) => Math.floor(max / pas) - Math.ceil(min / pas) + 1;
  return NICE_STEPS.find((pas) => lignes(pas) <= MAX_LEVELS) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

/**
 * @param {object} weather un DayWeather normalisé
 * @param {Date} at l'instant courant
 * @returns {object|null} la géométrie du tracé, ou null s'il n'y a rien à montrer
 */
export function buildTimeline(weather, at) {
  // La fenêtre vient de hours.js, partagée avec les phrases : le tracé et le
  // texte doivent parler du même intervalle.
  const heures = relevantHours(weather, at);
  if (heures.length < MIN_POINTS) return null;

  // L'échelle verticale doit englober l'enveloppe entre modèles, pas seulement
  // la médiane : sinon la bande d'incertitude sortirait du cadre dès que les
  // centres de prévision divergent.
  const aEnveloppe = heures.every((h) => h.feelsLikeLow != null && h.feelsLikeHigh != null);
  const ressentis = heures.flatMap((h) =>
    aEnveloppe ? [h.feelsLike, h.feelsLikeLow, h.feelsLikeHigh] : [h.feelsLike],
  );
  const min = Math.min(...ressentis);
  const max = Math.max(...ressentis);
  // Une journée parfaitement plate donnerait une division par zéro : on lui
  // impose une amplitude minimale, et le tracé se pose alors au milieu.
  const amplitude = Math.max(max - min, 1);

  const hautCourbe = TOP_PAD;
  const basCourbe = VIEW.height - RAIN_BAND;

  const y = (valeur) =>
    round(basCourbe - ((valeur - min) / amplitude) * (basCourbe - hautCourbe));

  const points = heures.map((h, i) => ({
    x: round((i / (heures.length - 1)) * PLOT_WIDTH),
    y: y(h.feelsLike),
    hour: h.hour,
    feelsLike: h.feelsLike,
    probability: h.precipitationProbability,
  }));

  const curve = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${curve} L${PLOT_WIDTH},${basCourbe} L0,${basCourbe} Z`;

  // La bande d'incertitude : le haut de l'enveloppe à l'aller, le bas au
  // retour. Absente en mono-modèle — une bande de largeur nulle laisserait
  // croire à un accord parfait alors qu'on n'a rien mesuré.
  const band = aEnveloppe
    ? [
        ...heures.map((h, i) => `${i === 0 ? 'M' : 'L'}${points[i].x},${y(h.feelsLikeHigh)}`),
        ...heures
          .map((h, i) => `L${points[i].x},${y(h.feelsLikeLow)}`)
          .reverse(),
        'Z',
      ].join(' ')
    : null;

  // Une barre par heure où la pluie est plausible. En dessous, on ne salit pas
  // le tracé avec des traits de deux pixels.
  const largeur = (PLOT_WIDTH / heures.length) * 0.55;
  const bars = points
    .filter((p) => p.probability >= 10)
    .map((p) => {
      const height = round((p.probability / 100) * RAIN_BAND);
      return {
        x: round(p.x - largeur / 2),
        y: round(VIEW.height - height),
        width: round(largeur),
        height,
        hour: p.hour,
        probability: p.probability,
      };
    });

  // Une graduation par heure. Une tous les quatre obligeait à interpoler à
  // l'œil pour situer 18 h, alors que c'est l'heure exacte qu'on cherche — et
  // que les barres de la frise s'alignent, elles, sur chaque heure.
  //
  // Les étiquettes, en revanche, se raréfient quand les heures se pressent :
  // vingt-quatre nombres ne tiennent pas côte à côte sur un téléphone. Les
  // graduations restent horaires, seuls les nombres s'espacent.
  const pas = points.length > LABEL_CROWD ? 2 : 1;

  // Des nombres nus, sans unité. Le « h » ne portait qu'une seule étiquette sur
  // seize, ce qui en faisait moins une unité qu'une irrégularité : on lisait
  // « 8 h » puis « 9 », et l'œil butait sur la différence. Une rangée de
  // nombres sous une courbe de température se lit comme des heures sans qu'on
  // ait besoin de le dire.
  const ticks = points.map((p) => ({
    x: p.x,
    hour: p.hour,
    label: p.hour % pas !== 0 ? null : `${p.hour}`,
  }));

  const sommet = points.reduce((a, b) => (a.feelsLike > b.feelsLike ? a : b));

  return {
    points,
    curve,
    area,
    band,
    bars,
    ticks,
    scale: buildScale(min, max, y),
    peak: { x: sommet.x, y: sommet.y, hour: sommet.hour, label: `${Math.round(sommet.feelsLike)}°` },
    range: { min, max },
  };
}

/**
 * L'échelle des ordonnées : des lignes de niveau à degrés ronds.
 *
 * Sans elle, la courbe n'était qu'une silhouette : on voyait qu'il faisait plus
 * chaud à 16 h qu'à 8 h, jamais de combien. Le seul chiffre porté était le pic,
 * et il ne suffit pas à situer le reste du tracé.
 *
 * Les lignes s'arrêtent au tracé, les nombres tiennent dans la gouttière de
 * droite. Elles passent sous la courbe au rendu : c'est un fond de repère, pas
 * une donnée.
 *
 * La bande de pluie du bas n'est pas légendée. Elle l'a été un temps, par un
 * « pluie » posé dans la gouttière ; à l'écran, le mot pesait plus lourd que
 * ce qu'il expliquait. Des barres bleues qui montent sous une courbe de
 * température se comprennent sans qu'on les nomme.
 *
 * @param {number} min le ressenti le plus bas de la fenêtre
 * @param {number} max le plus haut
 * @param {(valeur: number) => number} y la projection verticale du tracé
 */
function buildScale(min, max, y) {
  const pas = niceStep(min, max);

  const degrees = [];
  for (let valeur = Math.ceil(min / pas) * pas; valeur <= max; valeur += pas) {
    degrees.push({ value: valeur, y: y(valeur), label: `${valeur}°` });
  }

  return {
    // Où le tracé s'arrête et où les nombres commencent : les deux rendus s'en
    // servent plutôt que de refaire le calcul chacun de son côté.
    x: PLOT_WIDTH,
    degrees,
  };
}
