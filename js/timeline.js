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

import { relevantHours, NBSP } from './hours.js';

/** Repère normalisé du tracé. Le SVG s'y adapte par son viewBox. */
export const VIEW = { width: 100, height: 34 };

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

const round = (n) => Math.round(n * 100) / 100;

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
    x: round((i / (heures.length - 1)) * VIEW.width),
    y: y(h.feelsLike),
    hour: h.hour,
    feelsLike: h.feelsLike,
    probability: h.precipitationProbability,
  }));

  const curve = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${curve} L${VIEW.width},${basCourbe} L0,${basCourbe} Z`;

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
  const largeur = (VIEW.width / heures.length) * 0.55;
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
  // L'unité une seule fois : « 8 h, 9 h, 10 h… » seize fois noierait l'axe,
  // « 8 h, 9, 10 » se lit sans ambiguïté une fois la première posée. Elle suit
  // l'étiquette et non la position — la première graduation peut être muette.
  const premiere = points.find((p) => p.hour % pas === 0);

  const ticks = points.map((p) => ({
    x: p.x,
    hour: p.hour,
    label: p.hour % pas !== 0 ? null : p === premiere ? `${p.hour}${NBSP}h` : `${p.hour}`,
  }));

  const sommet = points.reduce((a, b) => (a.feelsLike > b.feelsLike ? a : b));

  return {
    points,
    curve,
    area,
    band,
    bars,
    ticks,
    peak: { x: sommet.x, y: sommet.y, hour: sommet.hour, label: `${Math.round(sommet.feelsLike)}°` },
    range: { min, max },
  };
}
