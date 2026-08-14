/**
 * Traduction des codes WMO en langage d’interface mobile.
 *
 * La prévision reste une donnée brute dans weather.js. Ce module ne décide
 * rien : il donne simplement à l'app les mots et les couleurs nécessaires
 * pour rester immédiatement lisible, quel que soit le ciel.
 */

import { familyOf } from './conditions.js';

const CONDITIONS = new Map([
  [0, 'Ciel dégagé'],
  [1, 'Ciel dégagé'],
  [2, 'Peu nuageux'],
  [3, 'Couvert'],
  [45, 'Brouillard'],
  [48, 'Brouillard givrant'],
  [51, 'Bruine'],
  [53, 'Bruine'],
  [55, 'Bruine'],
  [56, 'Bruine verglaçante'],
  [57, 'Bruine verglaçante'],
  [61, 'Pluie'],
  [63, 'Pluie'],
  [65, 'Forte pluie'],
  [66, 'Pluie verglaçante'],
  [67, 'Pluie verglaçante'],
  [71, 'Neige'],
  [73, 'Neige'],
  [75, 'Forte neige'],
  [77, 'Grains de neige'],
  [80, 'Averses'],
  [81, 'Averses'],
  [82, 'Fortes averses'],
  [85, 'Averses de neige'],
  [86, 'Fortes averses de neige'],
  [95, 'Orage'],
  [96, 'Orage et grêle'],
  [99, 'Orage et grêle'],
]);

const LIGHT_PALETTES = {
  clear: { background: '#DFF4FF', surface: '#F7FCFF', ink: '#10242F', muted: '#4F6470' },
  cloud: { background: '#DCE7ED', surface: '#F7FAFB', ink: '#14242D', muted: '#50636D' },
  rain: { background: '#BED4DE', surface: '#EFF6F8', ink: '#10242F', muted: '#425A66' },
  snow: { background: '#E8F0F4', surface: '#FFFFFF', ink: '#192831', muted: '#53636D' },
  storm: { background: '#AAB9CE', surface: '#EAF0FA', ink: '#142033', muted: '#46566E' },
};

const DARK_PALETTES = {
  clear: { background: '#142B37', surface: '#1B3745', ink: '#F3F7FA', muted: '#BBCED8' },
  cloud: { background: '#1B2831', surface: '#263743', ink: '#F3F7FA', muted: '#C1CDD4' },
  rain: { background: '#102B38', surface: '#173947', ink: '#F3F7FA', muted: '#B7CAD3' },
  snow: { background: '#25343C', surface: '#31454F', ink: '#F3F7FA', muted: '#C1CDD4' },
  storm: { background: '#101B2E', surface: '#192942', ink: '#F3F7FA', muted: '#C5D1E4' },
};

/**
 * La partition des codes vit dans `conditions.js`, avec l'accord entre modèles
 * qui s'en sert : deux copies finiraient par diverger, et la palette ne dirait
 * plus la même météo que le libellé.
 */
const familyFor = familyOf;

/** @param {number} weatherCode code WMO */
export function conditionLabel(weatherCode) {
  return CONDITIONS.get(weatherCode) ?? 'Conditions variables';
}

/**
 * @param {number} weatherCode code WMO
 * @param {'light'|'dark'} scheme apparence système
 */
export function weatherPalette(weatherCode, scheme = 'light') {
  const palettes = scheme === 'dark' ? DARK_PALETTES : LIGHT_PALETTES;
  return palettes[familyFor(weatherCode)];
}
