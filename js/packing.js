/**
 * Agrégation : un voyage et ses prévisions → une valise.
 *
 * Module pur. Il n'appelle ni le réseau, ni le DOM, ni l'horloge : l'instant
 * courant arrive en paramètre, comme partout ailleurs dans le moteur.
 *
 * Le principe tient en une phrase : `buildOutfit()` tourne sur chacune des N
 * journées du séjour, puis les tenues obtenues sont réunies par racine de
 * vêtement. Aucune règle d'habillage n'est réécrite ici — une valise est une
 * union de tenues, pas un second barème.
 *
 * Aucune phrase n'en sort : `phrasing.js` s'en charge, à partir des dates et des
 * quantités que ce module produit.
 */

import { dayLabel, placeDate } from './hours.js';
import { describeDay } from './phrasing.js';
import { buildOutfit } from './rules.js';

/**
 * Un voyage est-il encore lisible ?
 *
 * La garde vit ici, avec le contrat, et non dans le stockage de l'app : c'est
 * une règle du domaine, et c'est le seul endroit où elle peut être testée sous
 * Node. Un voyage écarté vaut mieux qu'un écran qui n'ouvre plus.
 *
 * @param {unknown} trip
 * @returns {boolean}
 */
export function isTrip(trip) {
  if (!trip || typeof trip !== 'object') return false;

  const { id, start, end, stops } = trip;
  if (!id || !start || !end) return false;
  if (!Array.isArray(stops) || stops.length === 0) return false;

  // La première étape commence au départ, sans quoi le premier jour du séjour
  // n'aurait aucune ville à laquelle se rattacher.
  if (stops[0].from !== start) return false;

  return stops.every(
    (stop) =>
      typeof stop?.from === 'string' &&
      Number.isFinite(stop.place?.latitude) &&
      Number.isFinite(stop.place?.longitude),
  );
}

/** Le lendemain d'une date ISO courte. Midi, pour ne pas glisser d'un jour. */
function nextDate(date) {
  const t = new Date(`${date}T12:00:00Z`).getTime() + 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Les dates de `from` à `to`, bornes incluses. */
function datesBetween(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = nextDate(date)) dates.push(date);
  return dates;
}

/**
 * Les étapes avec leurs bornes, déduites de la seule chose que le voyage
 * connaisse : le jour où l'on arrive dans chaque ville.
 *
 * Une étape court jusqu'à la veille de la suivante, la dernière jusqu'au retour.
 * C'est ce qui rend les trous et les chevauchements inexprimables : il n'y a
 * qu'une date par étape, donc rien à faire concorder.
 */
function legsOf(trip) {
  const stops = [...(trip.stops ?? [])].sort((a, b) => (a.from < b.from ? -1 : 1));

  return stops.map((stop, index) => ({
    place: stop.place,
    from: stop.from,
    to: index + 1 < stops.length ? previousDate(stops[index + 1].from) : trip.end,
  }));
}

/** La veille d'une date ISO courte. */
function previousDate(date) {
  const t = new Date(`${date}T12:00:00Z`).getTime() - 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * @param {object} trip le voyage : { id, start, end, stops, packed }
 * @param {object[][]} forecasts un tableau de DayWeather par étape, dans l'ordre
 *   des étapes. Une étape dont la requête a échoué passe un tableau vide.
 * @param {Date} at l'instant de consultation
 * @param {string|null} [profile] le vestiaire de qui lit, quand il l'a précisé
 * @returns {object} un Packing
 */
export function buildTrip(trip, forecasts, at = new Date(), profile = null) {
  const days = [];
  const covered = [];
  const missing = [];

  legsOf(trip).forEach((leg, index) => {
    const prevision = forecasts[index] ?? [];
    const parDate = new Map(prevision.map((weather) => [weather.date, weather]));

    // « Aujourd'hui » se juge à la date du lieu de l'étape : un séjour à Tokyo
    // n'a pas la même date d'aujourd'hui qu'un téléphone à Paris. On prend le
    // décalage de la prévision quand on l'a, faute de quoi celui du premier
    // jour connu, faute de quoi zéro.
    const offset = prevision[0]?.utcOffsetSeconds ?? 0;
    const aujourdhui = placeDate(at, offset);

    for (const date of datesBetween(leg.from, leg.to)) {
      // Les jours déjà vécus tombent : un séjour commencé ne parle que de ce
      // qui reste. Ils ne comptent pas non plus pour manquants — ils n'ont pas
      // manqué, ils sont passés.
      if (date < aujourdhui) continue;

      const weather = parDate.get(date);
      if (!weather) {
        missing.push(date);
        continue;
      }

      const outfit = buildOutfit(weather, profile);
      covered.push(date);
      days.push({
        id: date,
        label: dayLabel(date, date === aujourdhui),
        place: leg.place,
        weather,
        outfit,
        phrasing: describeDay(weather, outfit, at),
      });
    }
  });

  return {
    trip,
    days,
    wear: [],
    carry: [],
    notes: [],
    horizon: { covered, missing },
  };
}
