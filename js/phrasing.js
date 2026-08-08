/**
 * Mise en mots : (DayWeather, Outfit) → { headline, notes }.
 *
 * Module pur. Le ton visé est celui d'un proche qui te prévient avant que tu
 * sortes, pas celui d'un bulletin météo.
 *
 * Les variantes de formulation sont choisies de façon déterministe à partir de
 * la date : la page ne change donc pas de phrase d'un rechargement à l'autre,
 * et les tests sont reproductibles.
 */

/** Espace insécable, pour ne pas séparer le nombre de son unité en fin de ligne. */
const NBSP = '\u00A0';

/**
 * Accroches par palier de ressenti minimum, du plus chaud au plus froid.
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

/**
 * Alertes qui changent ce qu'on **emporte**, et méritent donc la phrase
 * principale plutôt qu'une note. Ordre de priorité à gravité égale.
 *
 * `cold` et `heat` en sont volontairement absents : l'accroche dit déjà « Il
 * gèle » ou « Ça va taper », une clause ne ferait que répéter. `swing` aussi,
 * car il parle de couches à ajuster, pas d'objets à prendre.
 *
 * Le vent passe avant la pluie parce que c'est lui qui rend le parapluie
 * inutilisable : le proposer puis le retirer trois lignes plus bas serait absurde.
 */
const CARRY_KINDS = ['ice', 'wind', 'rain', 'uv'];

/** Variantes de clause, par type d'alerte. */
const CLAUSES = {
  ice: () => [
    'Et des semelles qui accrochent, ça glisse.',
    'Prends de quoi accrocher au sol, ce sera traître.',
    'Attention au verglas — des semelles qui tiennent.',
  ],

  wind: (weather) => {
    const kmh = `${Math.round(weather.windGustsKmh)}${NBSP}km/h`;

    return weather.windGustsKmh >= 60
      ? [
          `Prends une capuche : à ${kmh}, le parapluie ne tiendra pas.`,
          `Capuche plutôt que parapluie, ça souffle à ${kmh}.`,
          `À ${kmh} de rafales, oublie le parapluie — capuche.`,
        ]
      : [
          `Et de quoi couper le vent, ça souffle à ${kmh}.`,
          `Prends un coupe-vent, ça souffle à ${kmh}.`,
          `Rafales à ${kmh} — prévois de quoi couper le vent.`,
        ];
  },

  rain: (weather, outfit) =>
    outfit.accessories.includes('parapluie')
      ? [
          'Mais garde un parapluie, ça va tomber.',
          'Et prends un parapluie.',
          'Prends quand même un parapluie.',
        ]
      : [
          'Et de quoi rester au sec.',
          'Prévois de quoi te protéger de la pluie.',
          'Et de quoi ne pas finir trempé.',
        ],

  uv: (weather) => [
    `Et de la crème solaire, l’UV monte à ${Math.round(weather.uvIndex)}.`,
    'Pense aux lunettes et à la crème.',
    'Et de quoi te protéger du soleil.',
  ],
};

/**
 * L'alerte à faire remonter dans la phrase. Une seule : en promouvoir plusieurs
 * diluerait exactement ce qui fait la force de cette page.
 */
function pickPromoted(outfit) {
  const candidates = outfit.alerts.filter((a) => CARRY_KINDS.includes(a.kind));
  if (candidates.length === 0) return null;

  return candidates.slice().sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      CARRY_KINDS.indexOf(a.kind) - CARRY_KINDS.indexOf(b.kind),
  )[0];
}

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

/**
 * Les pièces qui méritent d'être citées. On tait ce qui va de soi — personne
 * n'a besoin qu'on lui rappelle de mettre un jean — pour ne garder que ce qui
 * change d'un jour à l'autre.
 */
function notableGarments(outfit) {
  const { top, bottom, outer, feet } = outfit.layers;

  const items = top.filter((piece) => piece !== 't-shirt');
  if (items.length === 0) items.push('t-shirt');

  if (outer) items.push(outer);
  if (bottom === 'short') items.push('short');
  if (feet === 'chaussures adhérentes') items.push('chaussures qui accrochent');

  return items;
}

/** Transforme une alerte en phrase, en tenant compte de ce qui est réellement emporté. */
function noteFor(alert, outfit) {
  if (alert.kind === 'rain' && outfit.accessories.includes('parapluie')) {
    return `${alert.hint} Prends un parapluie.`;
  }
  return alert.hint;
}

/**
 * @param {object} weather un DayWeather normalisé
 * @param {object} outfit l'Outfit produit par buildOutfit
 * @returns {{ headline: string, notes: string[] }}
 */
export function describeDay(weather, outfit) {
  // On annonce le ressenti pour lequel la tenue a été décidée, sans quoi la
  // phrase contredirait les vêtements qu'elle recommande.
  // Exception : les journées qui finissent caniculaires, où même le point
  // d'habillage sous-vend la chaleur à venir.
  const pivot = outfit.alerts.some((a) => a.kind === 'heat')
    ? weather.feelsLikeMax
    : outfit.dressedFor;

  const opener = OPENERS.find((o) => pivot >= o.min);
  const variant = opener.variants[variantIndex(weather.date, opener.variants.length)];

  const ressenti = `${Math.round(pivot)}${NBSP}°C ressentis`;
  const tenue = `${variant}, ${ressenti} — ${enumerate(notableGarments(outfit))}.`;

  // Une alerte remonte dans la phrase quand elle change ce qu'on emporte, et
  // quitte alors les notes : son information est déjà délivrée.
  const promue = pickPromoted(outfit);
  const variantes = promue ? CLAUSES[promue.kind](weather, outfit) : null;
  const clause = variantes
    ? variantes[variantIndex(`${weather.date}:${promue.kind}`, variantes.length)]
    : null;

  const notes = outfit.alerts
    .filter((alert) => alert !== promue)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .map((alert) => noteFor(alert, outfit));

  return { headline: clause ? `${tenue} ${clause}` : tenue, notes };
}
