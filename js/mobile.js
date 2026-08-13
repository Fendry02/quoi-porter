/**
 * Contrat partagé par l'application mobile et ses widgets.
 *
 * Il garde l'interface native à distance du moteur météo : chaque journée a
 * déjà sa tenue et ses mots, tandis que le widget reçoit une version très
 * courte de cette même vérité. Aucun composant React Native n'entre ici, ce
 * qui permet de tester le comportement sous Node et de le réutiliser par les
 * deux plateformes.
 */

import { describeDay } from './phrasing.js';
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
 * @returns {object[]} journées de l'app, de la plus proche à la plus lointaine
 */
export function buildWeek(forecast, at = new Date()) {
  if (!Array.isArray(forecast)) return [];

  return forecast.slice(0, WEEK_LENGTH).map((weather, index) => {
    const outfit = buildOutfit(weather);

    return {
      id: weather.date,
      isToday: index === 0,
      label: dayLabel(weather.date, index === 0),
      weather,
      outfit,
      phrasing: describeDay(weather, outfit, at),
    };
  });
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
