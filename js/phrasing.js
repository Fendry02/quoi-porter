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
 * des fragments. On dit désormais tout, même le jean.
 *
 * Les variantes de la phrase météo sont choisies de façon déterministe à partir
 * de la date : la page ne change pas de formulation d'un rechargement à
 * l'autre. La tenue, elle, ne varie jamais — c'est un fait, pas une tournure.
 */

import { relevantHours, spanOf, peakOf, phraseSpan, dayLabel, NBSP } from './hours.js';
import { dressingPoint, outfitIsRobust } from './rules.js';

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
  casquette: 'une casquette',
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
 * La tenue entière : les couches du haut, le bas, la couche extérieure. Pas de
 * chaussures — le moteur n'en décide plus, voir `js/rules.js`.
 */
function wearSentence(outfit) {
  const { top, bottom, outer } = outfit.layers;
  const pieces = [...top, bottom, outer].filter(Boolean);

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
  const reserves = [];

  if (!outfitIsRobust(weather)) {
    const ecart = weather.feelsLikeSpread.toLocaleString('fr-FR', {
      maximumFractionDigits: 1,
    });

    reserves.push(`Les modèles divergent de ${ecart}${NBSP}°C — la tenue pourrait être différente.`);
  }

  const dissidence = dissentWarning(weather.conditionDissent);
  if (dissidence) reserves.push(dissidence);

  return reserves.length > 0 ? reserves.join(' ') : null;
}

/** Un modèle par voix, écrit en toutes lettres : ils sont cinq au plus. */
const COMPTES = ['aucun', 'un', 'deux', 'trois', 'quatre', 'cinq'];

const DISSENT_PHRASES = {
  storm: 'un orage',
  snow: 'de la neige',
  rain: 'de la pluie',
  cloud: 'un ciel couvert',
};

/**
 * La minorité qui annonce nettement pire.
 *
 * Le consensus décide de la tenue, et il a raison de le faire — mais partir
 * sans savoir qu'un centre attend un orage n'est pas la même chose que partir
 * en l'ayant lu. `conditions.js` a déjà filtré les désaccords de voisinage :
 * ce qui arrive ici mérite d'être dit.
 */
function dissentWarning(dissent) {
  if (!dissent) return null;

  const quoi = DISSENT_PHRASES[dissent.family];
  if (!quoi) return null;

  const combien = COMPTES[dissent.count] ?? String(dissent.count);
  const total = COMPTES[dissent.total] ?? String(dissent.total);
  const pluriel = dissent.count > 1;

  return `${combien.charAt(0).toUpperCase()}${combien.slice(1)} modèle${pluriel ? 's' : ''} sur ${total} annonce${pluriel ? 'nt' : ''} ${quoi}.`;
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
 *            weatherParts: {before: string, value: number, after: string},
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

  // La phrase est aussi rendue en trois morceaux, pour que l'app puisse faire
  // rouler le nombre comme un compteur au lieu de le réécrire d'un coup. Elle
  // reste construite ici, et non recomposée là-bas : la formulation n'a qu'un
  // seul endroit où vivre, sinon les deux finissent par diverger d'une virgule.
  const weatherParts = {
    before: `${variant}, `,
    value: Math.round(pivot),
    after: `${NBSP}°C ressentis.`,
  };

  return {
    wear: wearSentence(outfit),
    carry: carrySentence(outfit),
    weather: `${weatherParts.before}${weatherParts.value}${weatherParts.after}`,
    weatherParts,
    confidence: confidenceWarning(weather),
    notes: outfit.alerts
      .slice()
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
      .map((alert) => noteFor(alert, hours, window)),
  };
}

/** En dessous de cet écart, hier et aujourd'hui s'habillent pareil. */
const SAME_AS_YESTERDAY = 1.5;

/**
 * L'écart avec hier, en une phrase.
 *
 * On ne s'habille pas d'après un chiffre absolu : quatorze degrés ne veulent
 * rien dire tant qu'on ne sait pas ce qu'on a vécu la veille. C'est la
 * comparaison qui décide, et c'est elle qu'on donne.
 *
 * On compare les points d'habillage et non les maximums : deux journées de même
 * maximum mais d'amplitude opposée ne demandent pas la même tenue, et c'est le
 * matin qu'on sort.
 *
 * @param {object} today un DayWeather normalisé
 * @param {object|null} yesterday la veille, quand on l'a
 * @returns {string|null} null s'il n'y a rien à comparer
 */
export function versusYesterday(today, yesterday) {
  if (!yesterday) return null;

  const ecart = dressingPoint(today) - dressingPoint(yesterday);
  if (Math.abs(ecart) < SAME_AS_YESTERDAY) return 'Comme hier.';

  const degres = Math.round(Math.abs(ecart));
  return `${degres}${NBSP}°C de ${ecart > 0 ? 'plus' : 'moins'} qu’hier.`;
}

/* -------------------------------------------------------------- la valise */

/** Mots des petits nombres, pour les détails de poids. */
const EXEMPLAIRES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept'];

/**
 * Les mots qui ne prennent pas la marque du pluriel dans un nom de vêtement.
 *
 * « pantalon léger ou jupe » donne « pantalons légers ou jupes » : la
 * conjonction reste, tout le reste s'accorde. Une table de noms complets aurait
 * pourri au premier palier ajouté dans `rules.js`.
 */
const INVARIABLES = new Set(['ou', 'et', 'de', 'à', 'la', 'le']);

/** Le pluriel d'un nom de vêtement, mot à mot. */
function pluralOf(name) {
  return name
    .split(' ')
    .map((mot) => {
      if (INVARIABLES.has(mot)) return mot;
      return /[sx]$/.test(mot) ? mot : `${mot}s`;
    })
    .join(' ');
}

/** Le qualificatif d'un poids : « pull épais » sous la racine « pull » → « épais ». */
function qualifierOf(name, key) {
  const reste = name.startsWith(key) ? name.slice(key.length).trim() : '';
  return reste || name;
}

/** Les jours d'une ligne, en mots. */
function whenDays(dates, total) {
  if (dates.length === 0) return 'aucun jour';
  if (total > 0 && dates.length >= total) return 'tous les jours';

  return enumerate(dates.map((date) => dayLabel(date, false)));
}

/** « 2 → 4 sept. », ou « 30 août → 2 sept. » à cheval sur deux mois. */
function phraseDates(start, end) {
  const jourEtMois = (date) =>
    new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
      new Date(`${date}T12:00:00`),
    );
  const mois = (date) => jourEtMois(date).split(' ').slice(1).join(' ');
  const jour = (date) => jourEtMois(date).split(' ')[0];

  return mois(start) === mois(end)
    ? `${jour(start)} → ${jourEtMois(end)}`
    : `${jourEtMois(start)} → ${jourEtMois(end)}`;
}

/** Au-dessous de ce nombre de modèles, la prévision ne se mesure plus vraiment. */
const THIN_ENSEMBLE = 3;

/** Le nombre de centres interrogés, pour le dire en toutes lettres. */
const CENTRES = 5;

/**
 * Ce que la valise ne peut pas promettre.
 *
 * Au-delà du septième jour, Météo-France et l'ICON ont cessé de publier : il ne
 * reste qu'ECMWF et GFS, puis GFS seul. L'écart entre deux modèles ressemble à
 * l'écart entre cinq, en plus petit — et taire cette différence rendrait l'app
 * la plus sûre d'elle là où elle en sait le moins.
 */
function ensembleWarning(days) {
  const maigre = days.find((jour) => (jour.weather?.modelCount ?? CENTRES) < THIN_ENSEMBLE);
  if (!maigre) return null;

  const combien = maigre.weather.modelCount;
  return `À partir du ${dayLabel(maigre.id, false)}, ${combien} centre${combien > 1 ? 's' : ''} de prévision sur ${CENTRES} répond${combien > 1 ? 'ent' : ''} encore — la liste peut bouger.`;
}

/** Les jours du séjour que la prévision n'atteint pas encore. */
function horizonWarning(missing) {
  if (missing.length === 0) return null;

  if (missing.length === 1) {
    return 'Le dernier jour est trop loin : la météo n’existe pas encore pour lui.';
  }

  return `Les ${missing.length} derniers jours sont trop loin : la météo n’existe pas encore pour eux.`;
}

/**
 * La valise en mots.
 *
 * Aucune date ISO n'en sort : l'écran n'a plus rien à formater, et la mise en
 * mots ne vit qu'à un seul endroit.
 *
 * @param {object} packing un Packing produit par `js/packing.js`
 */
export function describePacking(packing) {
  const total = packing.horizon.covered.length;

  return {
    title: enumerateStops(packing.trip.stops),
    dates: phraseDates(packing.trip.start, packing.trip.end),
    wear: packing.wear.map((item) => {
      const unSeulPoids = item.pieces.length === 1;
      const piece = item.pieces[0];

      return {
        key: item.key,
        label: unSeulPoids
          ? `${item.count} ${item.count > 1 ? pluralOf(piece.name) : piece.name}`
          : `${item.count} ${pluralOf(item.key)}`,
        detail: unSeulPoids
          ? null
          : item.pieces
              .map((p) => `${EXEMPLAIRES[p.count] ?? p.count} ${qualifierOf(p.name, item.key)}`)
              .join(', '),
        why: item.capped
          ? `${whenDays(item.days, total)} — au-delà, tu laveras`
          : whenDays(item.days, total),
      };
    }),
    carry: packing.carry.map((item) => ({
      key: item.key,
      label: ARTICLES[item.key] ?? item.key,
      why: whenDays(item.days, total),
    })),
    notes: packing.notes.map((note) => ({
      label: note.label,
      text: note.text,
      when: whenDays(note.days, total),
    })),
    confidence: ensembleWarning(packing.days),
    horizon: horizonWarning(packing.horizon.missing),
  };
}

/** Les villes du séjour, sans région ni pays — elles ne tiennent pas en titre. */
function enumerateStops(stops) {
  return (stops ?? [])
    .map((stop) => stop.place.name.split(',')[0].trim())
    .join(' → ');
}
