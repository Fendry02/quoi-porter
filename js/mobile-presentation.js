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

/* ------------------------------------------------------------- le contraste */

/** Un voile clair sous une encre sombre, un voile sombre sous une encre claire. */
const LIGHT_VEIL = '#ffffff';
const DARK_VEIL = '#060a14';

/** Ce qu'on exige du texte principal, et du texte secondaire, plus discret. */
const INK_TARGET = 4.5;
const MUTED_TARGET = 3;

/** L'opacité de l'encre secondaire, celle que l'app applique au texte discret. */
const MUTED_ALPHA = 0.69;

/**
 * Au-delà, le voile ne laisse plus rien voir du ciel. On préfère un contraste
 * imparfait à une vitre laiteuse : aucune palette du produit n'y arrive, la
 * borne n'est là que pour garantir que la recherche s'arrête.
 */
const VEIL_CEILING = 0.9;
const VEIL_STEP = 0.01;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** Une couleur `#rrggbb` en trois canaux sRGB de 0 à 1. */
function channelsOf(hex) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toHex(channels) {
  const octets = channels.map((c) =>
    Math.round(clamp01(c) * 255)
      .toString(16)
      .padStart(2, '0'),
  );

  return `#${octets.join('')}`;
}

/** Linéarisation d'un canal sRGB, telle que la définit WCAG. */
function linearize(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative d'une couleur opaque, de 0 (noir) à 1 (blanc). */
export function luminanceOf(hex) {
  const [r, g, b] = channelsOf(hex).map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Rapport de contraste WCAG entre deux couleurs opaques, de 1 à 21.
 *
 * Symétrique : c'est un écart, pas une direction.
 */
export function contrastRatio(a, b) {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);

  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** La couleur obtenue en posant `veil` à l'opacité `alpha` par-dessus `base`. */
export function blendOver(veil, alpha, base) {
  const dessus = channelsOf(veil);
  const dessous = channelsOf(base);

  return toHex(dessus.map((c, i) => c * alpha + dessous[i] * (1 - alpha)));
}

/** Le texte reste-t-il lisible sur ce ciel, sous ce voile ? */
function holdsUp(ink, veil, alpha, sky, target) {
  const fond = blendOver(veil, alpha, sky);
  if (contrastRatio(ink, fond) < target) return false;

  // Le texte discret est la même encre à 69 % : il perd du contraste, et c'est
  // souvent lui qui décide de l'opacité, pas le titre.
  const discret = blendOver(ink, MUTED_ALPHA, fond);
  return contrastRatio(discret, fond) >= MUTED_TARGET;
}

/**
 * Le voile nécessaire pour que le texte reste lisible sur un ciel vivant.
 *
 * L'encre vient de `js/sky.js` et suit l'ambiance, mais elle a été choisie pour
 * l'harmonie du dégradé, pas pour un rapport de contraste. Le crépuscule clair
 * en est la preuve : une encre presque noire sur un zénith bleu sombre tombe à
 * 2 pour 1, très loin du lisible.
 *
 * Plutôt qu'une opacité fixe réglée à l'œil sur un seul état, on cherche la
 * plus petite qui tienne la cible sur **toutes** les couleurs du ciel qu'on lui
 * donne — le zénith et l'horizon encadrent le dégradé, donc tout ce qui est
 * entre les deux est couvert. Un ciel qui portait déjà bien son encre reçoit un
 * voile quasi nul, et garde son éclat.
 *
 * @param {string} ink la couleur du texte, `#rrggbb`
 * @param {string[]} skies les couleurs du ciel derrière le texte
 * @param {number} [target] le rapport de contraste visé pour le texte principal
 * @returns {{color: string, alpha: number}} le voile à poser
 */
export function veilFor(ink, skies, target = INK_TARGET) {
  const color = luminanceOf(ink) > 0.5 ? DARK_VEIL : LIGHT_VEIL;

  for (let pas = 0; pas <= Math.round(VEIL_CEILING / VEIL_STEP); pas += 1) {
    const alpha = Math.round(pas * VEIL_STEP * 100) / 100;
    if (skies.every((sky) => holdsUp(ink, color, alpha, sky, target))) {
      return { color, alpha };
    }
  }

  return { color, alpha: VEIL_CEILING };
}
