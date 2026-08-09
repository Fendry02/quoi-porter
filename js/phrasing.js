/**
 * Mise en mots : (DayWeather, Outfit) → ce que la page affiche.
 *
 * Module pur. Il rend quatre choses, dans l'ordre où on les lit :
 *
 *   wear     la tenue, entière — c'est la réponse à la question de la page ;
 *   carry    ce qu'on emporte en plus ;
 *   weather  pourquoi, en une phrase ;
 *   notes    les points d'attention, chacun avec son libellé, son horaire en
 *            mots, et la plage d'heures brute dont la frise a besoin ;
 *   confidence  un avertissement, quand les centres de prévision divergent
 *            assez pour que la tenue soit en jeu.
 *
 * La tenue passe devant parce que c'est ce qu'on est venu chercher. Une version
 * précédente la noyait au milieu d'une phrase météo et en taisait la moitié
 * — « ce qui va de soi » — si bien qu'on ne voyait jamais une tenue, seulement
 * des fragments. On dit désormais tout, même le jean, même les baskets.
 *
 * Les variantes de la phrase météo sont choisies de façon déterministe à partir
 * de la date : la page ne change pas de formulation d'un rechargement à
 * l'autre. La tenue, elle, ne varie jamais — c'est un fait, pas une tournure.
 */

import { relevantHours, spanOf, peakOf, phraseSpan, NBSP } from './hours.js';
import { outfitIsRobust } from './rules.js';

/**
 * Accroches par palier de ressenti, du plus chaud au plus froid.
 * `min` est la borne inférieure incluse.
 *
 * Aucune ne nomme le jour : la même phrase sert pour aujourd'hui et pour
 * demain, et le titre au-dessus dit déjà lequel. « Ça va taper aujourd'hui »
 * sous un titre DEMAIN se contredirait.
 */
const OPENERS = [
  { min: 30, variants: ['Ça va taper', 'Grosse chaleur en vue', 'Journée caniculaire'] },
  { min: 25, variants: ['Il va faire bien chaud', 'Belle chaleur', 'Ça va être chaud'] },
  { min: 20, variants: ['Journée douce', 'Il va faire bon', 'Temps agréable'] },
  { min: 15, variants: ['Doux sans plus', 'Température agréable', 'Ni chaud ni froid'] },
  { min: 10, variants: ['Ça reste frais', 'Un peu frais', 'Petite fraîcheur'] },
  { min: 5, variants: ['Il va faire frisquet', 'Plutôt frisquet', 'Ça pique un peu'] },
  { min: 0, variants: ['Il va faire froid', 'Franchement froid', 'Le froid s’installe'] },
  { min: -Infinity, variants: ['Ça va être glacial', 'Il gèle', 'Froid mordant'] },
];

/** Ordre d'affichage des points d'attention. */
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/** Articles des choses qu'on emporte, pour que la ligne se lise à voix haute. */
const ARTICLES = {
  parapluie: 'un parapluie',
  gants: 'des gants',
  bonnet: 'un bonnet',
  lunettes: 'des lunettes',
  écharpe: 'une écharpe',
};

/**
 * Index de variante dérivé de la date. Déterministe, réparti correctement sur
 * de petits pools — un simple modulo sur la somme des codes donnerait des
 * séquences trop régulières d'un jour à l'autre.
 */
function variantIndex(seed, poolSize) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % poolSize;
}

/** « a », « a et b », « a, b et c ». */
function enumerate(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

function capitalize(phrase) {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * La tenue entière, de la tête aux pieds : les couches du haut, le bas, la
 * couche extérieure, les chaussures.
 */
function wearSentence(outfit) {
  const { top, bottom, outer, feet } = outfit.layers;
  const pieces = [...top, bottom, outer, feet].filter(Boolean);

  return `${capitalize(enumerate(pieces))}.`;
}

/**
 * Ce qu'on emporte en plus, ou null s'il n'y a rien à prendre.
 *
 * « Avec » plutôt qu'un « + » : un mot dit sans ambiguïté que ces choses-là se
 * prennent et ne se portent pas, là où un symbole demandait d'être interprété.
 */
function carrySentence(outfit) {
  if (outfit.accessories.length === 0) return null;

  const items = outfit.accessories.map((a) => ARTICLES[a] ?? a);
  return `Avec ${enumerate(items)}.`;
}

/**
 * Quand chaque type d'alerte se produit, dans la fenêtre observée.
 *
 * Savoir qu'il va pleuvoir sans savoir quand ne sert à rien : c'est l'heure
 * qui décide si on sort maintenant ou si on attend.
 *
 * Deux absences volontaires. `uv` : Open-Meteo ne donne pas l'indice heure par
 * heure, et l'inventer serait mentir. `swing` : sa phrase porte déjà ses deux
 * bornes de température, une troisième indication l'alourdirait.
 */
const tombe = (h) => h.precipitationProbability >= 40 || h.precipitationMm > 0.2;

const TIMING = {
  rain: (hours) => spanOf(hours, tombe),

  // Le verglas suit les précipitations : c'est le même phénomène.
  ice: (hours) => spanOf(hours, tombe),

  wind: (hours) => spanOf(hours, (h) => h.windGustsKmh >= 40),

  cold: (hours) => spanOf(hours, (h) => h.feelsLike < 0),

  // Pour la chaleur, un instant plutôt qu'une plage : c'est le pic qu'on évite.
  // Il prend malgré tout la forme d'une plage d'une heure, pour que la frise
  // n'ait qu'un seul cas à dessiner.
  heat: (hours) => {
    const sommet = peakOf(hours, (h) => h.feelsLike);
    return sommet ? { from: sommet.hour, to: sommet.hour } : null;
  },
};

/**
 * Transforme une alerte en note.
 *
 * `span` porte les heures brutes, `when` les mêmes heures en mots. Les deux
 * viennent du même calcul : la frise et le texte ne peuvent pas diverger.
 */
function noteFor(alert, hours, window) {
  const situer = TIMING[alert.kind];
  const span = situer && hours.length > 0 ? situer(hours) : null;

  return {
    label: alert.label,
    text: alert.hint,
    span,
    when: span ? phraseSpan(span, window) : null,
  };
}

/**
 * Prévient quand les modèles ne s'accordent pas assez pour qu'on se fie à la
 * tenue.
 *
 * On ne se déclenche pas sur un seuil en degrés : le désaccord typique entre
 * centres tourne autour de 2 °C, un seuil fixe crierait au loup une fois sur
 * deux. On ne prévient que lorsque le désaccord franchit une frontière du
 * barème — c'est-à-dire quand il change réellement les vêtements.
 */
function confidenceWarning(weather) {
  if (outfitIsRobust(weather)) return null;

  const ecart = weather.feelsLikeSpread.toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  });

  return `Les modèles divergent de ${ecart}${NBSP}°C — la tenue pourrait être différente.`;
}

/**
 * Le titre de l'onglet, une fois la prévision connue.
 *
 * Un onglet est large de quelques mots : on y met la réponse, pas la question.
 * « Qu'est-ce que je mets ? » reste le titre de départ — il dit ce qu'on
 * trouvera ici tant qu'on ne sait rien — mais dès que la page sait, elle le
 * dit, et une fenêtre pleine d'onglets se relit d'un coup d'œil.
 *
 * La pièce retenue est celle qui se voit : le manteau s'il y en a un, sinon la
 * dernière couche du haut. Le lieu perd sa région et son pays, qui n'apportent
 * rien dans si peu de place.
 *
 * @param {object} outfit l'Outfit produit par buildOutfit
 * @param {string} [placeName] le lieu, tel qu'affiché en haut de page
 */
export function pageTitle(outfit, placeName) {
  const { top, outer } = outfit.layers;
  const piece = outer ?? top[top.length - 1];
  const tenue = `${capitalize(piece)} · ${Math.round(outfit.dressedFor)}°`;
  const ville = placeName?.split(',')[0].trim();

  return ville ? `${tenue} · ${ville}` : tenue;
}

/**
 * @param {object} weather un DayWeather normalisé
 * @param {object} outfit l'Outfit produit par buildOutfit
 * @param {Date} at l'instant courant, pour ne dater que ce qui reste à venir
 * @returns {{wear: string, carry: string|null, weather: string,
 *            confidence: string|null,
 *            notes: {label: string, text: string, when: string|null,
 *                    span: {from: number, to: number}|null}[]}}
 */
export function describeDay(weather, outfit, at) {
  // On annonce le ressenti pour lequel la tenue a été décidée, sans quoi la
  // phrase contredirait les vêtements listés juste au-dessus.
  // Exception : les journées qui finissent caniculaires, où même le point
  // d'habillage sous-vendrait la chaleur à venir.
  const pivot = outfit.alerts.some((a) => a.kind === 'heat')
    ? weather.feelsLikeMax
    : outfit.dressedFor;

  const opener = OPENERS.find((o) => pivot >= o.min);
  const variant = opener.variants[variantIndex(weather.date, opener.variants.length)];

  // La même fenêtre que la courbe : le texte et le tracé doivent parler du
  // même intervalle, sinon l'un annoncerait une averse que l'autre ignore.
  const hours = relevantHours(weather, at);
  const window = hours.length > 0
    ? { from: hours[0].hour, to: hours[hours.length - 1].hour }
    : null;

  return {
    wear: wearSentence(outfit),
    carry: carrySentence(outfit),
    weather: `${variant}, ${Math.round(pivot)}${NBSP}°C ressentis.`,
    confidence: confidenceWarning(weather),
    notes: outfit.alerts
      .slice()
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
      .map((alert) => noteFor(alert, hours, window)),
  };
}
