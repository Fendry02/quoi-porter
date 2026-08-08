/**
 * Régulateur de qualité.
 *
 * Le cœur, `nextTier`, est une fonction pure : on lui donne le palier courant
 * et les durées des dernières images, elle rend le palier à tenir. Elle ne
 * touche ni au rendu ni au temps, ce qui la rend testable.
 *
 * Elle ne descend jamais que dans un sens. Remonter en qualité dès que la
 * situation s'améliore paraît généreux, mais provoque un battement visible :
 * on remonte, ça rame, on redescend, en boucle. Une dégradation monotone avec
 * un plancher est plus simple à raisonner et invisible à l'usage.
 */

/** Du plus riche au plus pauvre. */
export const TIERS = ['high', 'medium', 'low'];

/** Nombre d'images observées avant de trancher. */
export const SAMPLE_SIZE = 90;

/** Au-delà de cette durée d'image, on considère que ça rame (≈ 45 images/s). */
const SLOW_FRAME_MS = 22;

const SETTINGS = {
  high: { maxPixelRatio: 2, particleScale: 1, cloudLayers: 5, grain: true },
  medium: { maxPixelRatio: 1.5, particleScale: 0.55, cloudLayers: 3, grain: true },
  low: { maxPixelRatio: 1, particleScale: 0.28, cloudLayers: 2, grain: false },
};

/**
 * Médiane plutôt que moyenne : un à-coup isolé — un ramasse-miettes, un onglet
 * qui reprend la main — ne doit pas coûter un palier de qualité.
 */
function median(values) {
  const tries = [...values].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);

  return tries.length % 2 === 0 ? (tries[milieu - 1] + tries[milieu]) / 2 : tries[milieu];
}

/**
 * @param {string} currentTier palier en cours
 * @param {number[]} frameTimes durées des images, la plus récente en dernier
 * @returns {string} le palier à tenir
 */
export function nextTier(currentTier, frameTimes) {
  if (frameTimes.length < SAMPLE_SIZE) return currentTier;

  const recentes = frameTimes.slice(-SAMPLE_SIZE);
  if (median(recentes) <= SLOW_FRAME_MS) return currentTier;

  const rang = TIERS.indexOf(currentTier);
  return TIERS[Math.min(rang + 1, TIERS.length - 1)];
}

/**
 * @param {string} tier
 * @returns {{maxPixelRatio: number, particleScale: number, cloudLayers: number, grain: boolean}}
 */
export function settingsFor(tier) {
  return SETTINGS[tier] ?? SETTINGS.medium;
}
