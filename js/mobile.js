/**
 * Contrat partagé par l'application mobile et ses widgets.
 *
 * Il garde l'interface native à distance du moteur météo : chaque journée a
 * déjà sa tenue et ses mots, tandis que le widget reçoit une version très
 * courte de cette même vérité. Aucun composant React Native n'entre ici, ce
 * qui permet de tester le comportement sous Node et de le réutiliser par les
 * deux plateformes.
 */

import { placeDate } from './hours.js';
import { laterAdvice } from './moments.js';
import { describeDay, versusYesterday } from './phrasing.js';
import { buildOutfit } from './rules.js';

const WEEK_LENGTH = 7;

/**
 * Libellé calendaire stable : la date météo est déjà locale au lieu consulté.
 * Midi évite que la conversion d'un ISO sans fuseau ne bascule au jour voisin.
 */
function dayLabel(date, isToday) {
  if (isToday) return 'Aujourd’hui';

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00`));
}

/**
 * Les sept journées prêtes à afficher dans l'app : le calcul de tenue et la
 * formulation restent les mêmes que sur le web, sans duplication de règles.
 *
 * @param {object[]} forecast les DayWeather normalisés par weather.js
 * @param {Date} at instant de consultation, pour situer les alertes horaires
 * @param {string|null} [profile] le vestiaire de qui lit, quand il l'a précisé
 * @returns {object[]} journées de l'app, de la plus proche à la plus lointaine
 */
export function buildWeek(forecast, at = new Date(), profile = null) {
  if (!Array.isArray(forecast)) return [];

  const depart = todayIndex(forecast, at);
  const veille = forecast[depart - 1] ?? null;

  return forecast.slice(depart, depart + WEEK_LENGTH).map((weather, index) => {
    const outfit = buildOutfit(weather, profile);
    const isToday = index === 0;

    return {
      id: weather.date,
      isToday,
      label: dayLabel(weather.date, isToday),
      weather,
      outfit,
      phrasing: {
        ...describeDay(weather, outfit, at),
        // Seul aujourd'hui se compare à la veille, et seul aujourd'hui a une
        // suite : « 3 °C de moins qu'hier » ou « prends une veste pour ce soir »
        // sous un titre JEUDI ne voudraient rien dire.
        versusYesterday: isToday ? versusYesterday(weather, veille) : null,
        later: isToday ? laterAdvice(weather, outfit, at) : null,
      },
    };
  });
}

/**
 * Où commence aujourd'hui dans la prévision.
 *
 * On le cherche par sa date au lieu de supposer l'entrée 0 : dès qu'on demande
 * la veille pour comparer, elle arrive en tête et la supposition devient fausse.
 *
 * Le premier jour qui n'est pas passé, et non le premier tout court : si la date
 * du jour manque — prévision périmée, fuseau qui décale — reculer sur la veille
 * ferait conseiller la tenue d'hier, jusque dans le widget. Les dates ISO se
 * comparent comme des chaînes, et la prévision est déjà dans l'ordre.
 */
function todayIndex(forecast, at) {
  const offset = forecast[0]?.utcOffsetSeconds ?? 0;
  const aujourdhui = placeDate(at, offset);
  const trouve = forecast.findIndex((weather) => weather.date >= aujourdhui);

  return trouve >= 0 ? trouve : 0;
}

/**
 * Données minimales pour les widgets natifs. Le widget n'est pas une deuxième
 * app : il répond d'un regard et ouvre l'app pour le reste de la semaine.
 *
 * @param {object} day une journée produite par buildWeek
 * @param {string} placeName nom complet du lieu sélectionné
 * @returns {{place: string, outfit: string, temperature: string, attention: string|null}}
 */
export function widgetSnapshot(day, placeName) {
  const city = placeName?.split(',')[0]?.trim() || 'Ma position';
  const risk = day.phrasing.notes[0]?.label ?? null;

  return {
    place: city,
    outfit: day.phrasing.wear.replace(/\.$/, ''),
    // La tenue est calculée sur le ressenti : le widget affiche donc la même
    // grandeur, plutôt qu'une température réelle qui la contredirait.
    temperature: `${Math.round(day.weather.feelsLikeMin)}–${Math.round(day.weather.feelsLikeMax)}°`,
    attention: risk,
  };
}
