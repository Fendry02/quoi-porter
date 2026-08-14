/**
 * Ce que la tenue du jour ne peut pas dire.
 *
 * `dressingPoint` ne rend qu'un seul ressenti pour toute la journée, biaisé vers
 * le froid parce qu'on sort le matin. C'est le bon choix pour décider d'une
 * tenue, mais il tait une chose : celle qui suffit à 8 h peut ne plus suffire à
 * 20 h, et celle qui va le matin peut devenir un supplice l'après-midi.
 *
 * Module pur. Il découpe ce qui reste de la journée, rhabille chaque moment —
 * `buildOutfit` est pure, l'appeler trois fois ne coûte rien — et ne parle que
 * si la tenue change. Sans quoi il se taît : prévenir quand rien ne bouge userait
 * la confiance dans les fois où il y a vraiment quelque chose à savoir.
 */

import { relevantHours } from './hours.js';
import { buildOutfit } from './rules.js';

/**
 * Les moments qu'on peut encore vivre, du plus proche au plus lointain. Le matin
 * n'y est pas : c'est lui que la tenue du jour habille déjà.
 */
const MOMENTS = [
  { name: 'cet après-midi', from: 12, to: 17 },
  { name: 'ce soir', from: 18, to: 22 },
];

/** En dessous, un moment est trop court pour qu'on en tire une tendance. */
const MIN_HOURS = 2;

/**
 * Articles des pièces qu'on emporte ou qu'on retire.
 *
 * « Prends manteau » se lirait mal, et se dirait plus mal encore à voix haute —
 * or ces phrases passent par VoiceOver.
 */
const INDEFINI = {
  veste: 'une veste',
  manteau: 'un manteau',
  'coupe-vent': 'un coupe-vent',
  imperméable: 'un imperméable',
};

const DEFINI = {
  pull: 'le pull',
  chemise: 'la chemise',
  't-shirt': 'le t-shirt',
  veste: 'la veste',
  manteau: 'le manteau',
  'coupe-vent': 'le coupe-vent',
  imperméable: 'l’imperméable',
  'sous-couche thermique': 'la sous-couche thermique',
};

/** Ce qui, dans une tenue, se prend ou se retire — le reste ne se transporte pas. */
function carriable(outfit) {
  const piece = outfit.layers.outer ?? outfit.layers.top[outfit.layers.top.length - 1];
  return DEFINI[piece] ?? piece;
}

/**
 * L'avis pour la suite de la journée, ou `null` s'il n'y a rien à signaler.
 *
 * @param {object} weather un DayWeather normalisé
 * @param {object} outfit la tenue retenue pour la journée
 * @param {Date} at l'instant courant
 * @returns {string|null}
 */
export function laterAdvice(weather, outfit, at) {
  const restantes = relevantHours(weather, at);
  if (restantes.length === 0) return null;

  let manque = null;
  let surplus = null;

  for (const moment of MOMENTS) {
    const heures = restantes.filter((h) => h.hour >= moment.from && h.hour <= moment.to);
    if (heures.length < MIN_HOURS) continue;

    const ressentis = heures.map((h) => h.feelsLike);
    const alors = buildOutfit({
      ...weather,
      feelsLikeMin: Math.min(...ressentis),
      feelsLikeMax: Math.max(...ressentis),
    });

    const couches = alors.layers.top.length;
    const dejaCouches = outfit.layers.top.length;

    // Le premier moment de chaque sorte suffit : le plus proche est celui sur
    // lequel on peut encore agir en partant.
    if (!manque) {
      if (alors.layers.outer && alors.layers.outer !== outfit.layers.outer) {
        const piece = INDEFINI[alors.layers.outer] ?? alors.layers.outer;
        manque = `Prends ${piece} pour ${moment.name}.`;
      } else if (couches > dejaCouches) {
        manque = `Prends une couche pour ${moment.name}.`;
      }
    }

    if (!surplus && (couches < dejaCouches || (outfit.layers.outer && !alors.layers.outer))) {
      surplus = `Tu auras trop chaud ${moment.name} — prévois de retirer ${carriable(outfit)}.`;
    }
  }

  // Ce qui manquera passe devant ce qui sera en trop, même s'il arrive plus
  // tard : on peut retirer une couche qu'on porte, on ne peut pas faire
  // apparaître un manteau resté chez soi.
  return manque ?? surplus;
}
