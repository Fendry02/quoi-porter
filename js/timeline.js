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

/** Repère normalisé du tracé. Le SVG s'y adapte par son viewBox. */
export const VIEW = { width: 100, height: 34 };

/** Hauteur réservée aux barres de pluie, en bas du repère. */
const RAIN_BAND = 11;

/** Marge haute, pour que le pic ne touche pas le bord. */
const TOP_PAD = 3;

/** Heure de départ pour un jour qui n'est pas aujourd'hui. */
const DEFAULT_START_HOUR = 8;

/** En dessous, une courbe ne décrit plus rien. */
const MIN_POINTS = 3;

const MINUTES_PER_DAY = 24 * 60;

/** Date locale au lieu, au format ISO court, pour un instant donné. */
function placeDate(at, utcOffsetSeconds) {
  return new Date(at.getTime() + utcOffsetSeconds * 1000).toISOString().slice(0, 10);
}

/** Heure locale au lieu, de 0 à 23. */
function placeHour(at, utcOffsetSeconds) {
  const minutes = Math.floor(at.getTime() / 60000) + utcOffsetSeconds / 60;
  return Math.floor((((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60);
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * @param {object} weather un DayWeather normalisé
 * @param {Date} at l'instant courant
 * @returns {object|null} la géométrie du tracé, ou null s'il n'y a rien à montrer
 */
export function buildTimeline(weather, at) {
  const offset = weather.utcOffsetSeconds ?? 0;

  // Aujourd'hui, on part de l'heure qu'il est : montrer une matinée déjà
  // passée n'aide personne. Les autres jours partent du matin.
  const estAujourdhui = weather.date === placeDate(at, offset);
  const debut = estAujourdhui ? placeHour(at, offset) : DEFAULT_START_HOUR;

  const heures = (weather.hours ?? []).filter((h) => h.hour >= debut);
  if (heures.length < MIN_POINTS) return null;

  const ressentis = heures.map((h) => h.feelsLike);
  const min = Math.min(...ressentis);
  const max = Math.max(...ressentis);
  // Une journée parfaitement plate donnerait une division par zéro : on lui
  // impose une amplitude minimale, et le tracé se pose alors au milieu.
  const amplitude = Math.max(max - min, 1);

  const hautCourbe = TOP_PAD;
  const basCourbe = VIEW.height - RAIN_BAND;

  const points = heures.map((h, i) => ({
    x: round((i / (heures.length - 1)) * VIEW.width),
    y: round(basCourbe - ((h.feelsLike - min) / amplitude) * (basCourbe - hautCourbe)),
    hour: h.hour,
    feelsLike: h.feelsLike,
    probability: h.precipitationProbability,
  }));

  const curve = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${curve} L${VIEW.width},${basCourbe} L0,${basCourbe} Z`;

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

  // Un repère toutes les quatre heures, en s'accrochant aux multiples de 4
  // pour tomber sur des heures rondes plutôt que sur « 15 h, 19 h, 23 h ».
  const ticks = points
    .filter((p) => p.hour % 4 === 0)
    .map((p) => ({ x: p.x, label: `${p.hour} h` }));

  const sommet = points.reduce((a, b) => (a.feelsLike > b.feelsLike ? a : b));

  return {
    points,
    curve,
    area,
    bars,
    ticks,
    peak: { x: sommet.x, y: sommet.y, hour: sommet.hour, label: `${Math.round(sommet.feelsLike)}°` },
    range: { min, max },
  };
}
