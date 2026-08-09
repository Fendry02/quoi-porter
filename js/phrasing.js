/**
 * Mise en mots : (DayWeather, Outfit) → ce que la page affiche.
 *
 * Module pur. Il rend quatre choses, dans l'ordre où on les lit :
 *
 *   wear     la tenue, entière — c'est la réponse à la question de la page ;
 *   carry    ce qu'on emporte en plus ;
 *   weather  pourquoi, en une phrase ;
 *   notes    les points d'attention.
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

/** Espace insécable, pour ne pas séparer le nombre de son unité en fin de ligne. */
const NBSP = ' ';

/**
 * Accroches par palier de ressenti, du plus chaud au plus froid.
 * `min` est la borne inférieure incluse.
 */
const OPENERS = [
  { min: 30, variants: ['Ça va taper aujourd’hui', 'Grosse chaleur en vue', 'Journée caniculaire'] },
  { min: 25, variants: ['Il va faire bien chaud', 'Belle chaleur aujourd’hui', 'Ça va être chaud'] },
  { min: 20, variants: ['Journée douce', 'Il va faire bon', 'Temps agréable aujourd’hui'] },
  { min: 15, variants: ['Doux sans plus', 'Température agréable', 'Ni chaud ni froid'] },
  { min: 10, variants: ['Ça reste frais', 'Un peu frais aujourd’hui', 'Petite fraîcheur'] },
  { min: 5, variants: ['Il va faire frisquet', 'Frisquet aujourd’hui', 'Ça pique un peu'] },
  { min: 0, variants: ['Il va faire froid', 'Franchement froid aujourd’hui', 'Le froid s’installe'] },
  { min: -Infinity, variants: ['Ça va être glacial', 'Il gèle aujourd’hui', 'Froid mordant'] },
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

/** Transforme une alerte en phrase. */
function noteFor(alert) {
  return alert.hint;
}

/**
 * @param {object} weather un DayWeather normalisé
 * @param {object} outfit l'Outfit produit par buildOutfit
 * @returns {{wear: string, carry: string|null, weather: string, notes: string[]}}
 */
export function describeDay(weather, outfit) {
  // On annonce le ressenti pour lequel la tenue a été décidée, sans quoi la
  // phrase contredirait les vêtements listés juste au-dessus.
  // Exception : les journées qui finissent caniculaires, où même le point
  // d'habillage sous-vendrait la chaleur à venir.
  const pivot = outfit.alerts.some((a) => a.kind === 'heat')
    ? weather.feelsLikeMax
    : outfit.dressedFor;

  const opener = OPENERS.find((o) => pivot >= o.min);
  const variant = opener.variants[variantIndex(weather.date, opener.variants.length)];

  return {
    wear: wearSentence(outfit),
    carry: carrySentence(outfit),
    weather: `${variant}, ${Math.round(pivot)}${NBSP}°C ressentis.`,
    notes: outfit.alerts
      .slice()
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
      .map(noteFor),
  };
}
