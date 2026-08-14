/**
 * Frontière typée vers `js/timeline.js`.
 *
 * Le tracé est calculé par le module partagé, le même que le web : la courbe,
 * la bande d'incertitude et les barres de pluie décrivent donc exactement la
 * même fenêtre horaire que les phrases affichées au-dessus.
 */

import { buildTimeline as buildTimelineJs, VIEW } from '../../../../js/timeline.js';

import type { DayWeather, TimelineGeometry } from '@/lib/types';

/** Repère normalisé du tracé : le rendu s'y adapte par une mise à l'échelle. */
export { VIEW };

/** La géométrie du jour, ou `null` s'il reste trop peu d'heures à montrer. */
export function buildTimeline(weather: DayWeather, at: Date): TimelineGeometry | null {
  return buildTimelineJs(weather, at) as TimelineGeometry | null;
}
