/**
 * Frontière typée vers `js/sky.js`.
 *
 * Le module partagé est en JavaScript et ne décrit ses retours qu'en JSDoc
 * (`@returns {object}`). On lui donne ici sa forme exacte une bonne fois, pour
 * que le rendu Skia travaille sur des champs vérifiés plutôt que sur `object`.
 */

import { blendMoods as blendMoodsJs, moodFor as moodForJs } from '../../../../js/sky.js';

import type { DayWeather, SkyMood } from '@/lib/types';

/** L'ambiance d'un jour, à un instant donné. */
export function moodFor(weather: DayWeather, at: Date): SkyMood {
  return moodForJs(weather, at) as SkyMood;
}

/** Mélange deux ambiances, `t` allant de 0 (a) à 1 (b). */
export function blendMoods(a: SkyMood, b: SkyMood, t: number): SkyMood {
  return blendMoodsJs(a, b, t) as SkyMood;
}
