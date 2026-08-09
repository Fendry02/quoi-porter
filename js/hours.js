/**
 * Le temps qu'il fera, heure par heure : quelle fenêtre regarder, quand une
 * condition se produit, et comment le dire.
 *
 * Module pur, partagé par `timeline.js` et `phrasing.js`. La définition de la
 * fenêtre vit ici et nulle part ailleurs : le tracé et les phrases doivent
 * parler du même intervalle, sans quoi la courbe montrerait une averse que le
 * texte passerait sous silence.
 */

/** Heure de départ pour un jour qui n'est pas aujourd'hui. */
const DEFAULT_START_HOUR = 8;

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

/**
 * Les heures qui restent à vivre.
 *
 * Aujourd'hui, on part de l'heure qu'il est : annoncer une averse à 9 h quand
 * il en est 15 n'aide personne. Les autres jours partent du matin.
 *
 * @param {object} weather un DayWeather normalisé
 * @param {Date} at l'instant courant
 * @returns {object[]} les heures retenues, dans l'ordre
 */
export function relevantHours(weather, at) {
  const offset = weather.utcOffsetSeconds ?? 0;
  const estAujourdhui = weather.date === placeDate(at, offset);
  const debut = estAujourdhui ? placeHour(at, offset) : DEFAULT_START_HOUR;

  return (weather.hours ?? []).filter((h) => h.hour >= debut);
}

/**
 * La période pendant laquelle une condition se vérifie.
 *
 * On rend la première et la dernière heure concernées, sans se soucier des
 * accalmies entre les deux : « de 14 h à 20 h » se retient, « 14-15 h puis
 * 19-20 h » non.
 *
 * @returns {{from: number, to: number}|null}
 */
export function spanOf(hours, predicate) {
  const concernees = hours.filter(predicate);
  if (concernees.length === 0) return null;

  return {
    from: concernees[0].hour,
    to: concernees[concernees.length - 1].hour,
  };
}

/**
 * L'heure où une grandeur culmine.
 *
 * @returns {{hour: number, value: number}|null}
 */
export function peakOf(hours, valueOf) {
  if (hours.length === 0) return null;

  const sommet = hours.reduce((a, b) => (valueOf(a) >= valueOf(b) ? a : b));
  return { hour: sommet.hour, value: valueOf(sommet) };
}

/**
 * Espace insécable : un nombre ne se sépare pas de son unité.
 *
 * Exporté plutôt que recopié — la mise en mots des heures vit ici. Une copie
 * de ce caractère invisible avait déjà dérivé en espace ordinaire sans que
 * rien ne le montre à la lecture.
 */
export const NBSP = '\u00A0';

const heure = (h) => `${h} h`;

/**
 * Met une période en mots, relativement à la fenêtre affichée.
 *
 * On dit « à partir de 18 h » plutôt que « de 18 h à 23 h » quand la période
 * court jusqu'au bout : la borne de fin n'apprend alors rien.
 *
 * @param {{from: number, to: number}} span
 * @param {{from: number, to: number}} window la fenêtre observée
 */
export function phraseSpan(span, window) {
  const debuteAuDebut = span.from <= window.from;
  const finitALaFin = span.to >= window.to;

  if (debuteAuDebut && finitALaFin) return 'toute la journée';
  if (finitALaFin) return `à partir de ${heure(span.from)}`;
  if (debuteAuDebut) return `jusqu’à ${heure(span.to)}`;
  if (span.from === span.to) return `vers ${heure(span.from)}`;

  return `de ${heure(span.from)} à ${heure(span.to)}`;
}

/** Une heure isolée. */
export function phraseHour(h) {
  return `vers ${heure(h)}`;
}

/**
 * La même période, mais en horodatage : de quoi légender une barre.
 *
 * Sur la frise, le libellé seul ne dit que « quoi » et « combien de temps » ;
 * pour savoir « quand », il faut redescendre à l'axe et interpoler entre deux
 * repères espacés de quatre heures. L'horodatage répond sur place.
 *
 * Compact et insécable : la légende est posée contre sa barre en absolu, un
 * retour à la ligne la détacherait de ce qu'elle désigne. D'où l'unité une
 * seule fois, au bout, et des espaces insécables.
 *
 * @param {{from: number, to: number}} span
 */
export function shortSpan(span) {
  if (span.from === span.to) return `${span.from}${NBSP}h`;

  return `${span.from}–${span.to}${NBSP}h`;
}
