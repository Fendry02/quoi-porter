/**
 * Agrégation : un voyage et ses prévisions → une valise.
 *
 * Module pur. Il n'appelle ni le réseau, ni le DOM, ni l'horloge : l'instant
 * courant arrive en paramètre, comme partout ailleurs dans le moteur.
 *
 * Le principe tient en une phrase : `buildOutfit()` tourne sur chacune des N
 * journées du séjour, puis les tenues obtenues sont réunies par racine de
 * vêtement. Aucune règle d'habillage n'est réécrite ici — une valise est une
 * union de tenues, pas un second barème.
 *
 * Aucune phrase n'en sort : `phrasing.js` s'en charge, à partir des dates et des
 * quantités que ce module produit.
 */

import { dayLabel, placeDate } from './hours.js';
import { describeDay } from './phrasing.js';
import { buildOutfit, garmentRoot } from './rules.js';

/**
 * Un voyage est-il encore lisible ?
 *
 * La garde vit ici, avec le contrat, et non dans le stockage de l'app : c'est
 * une règle du domaine, et c'est le seul endroit où elle peut être testée sous
 * Node. Un voyage écarté vaut mieux qu'un écran qui n'ouvre plus.
 *
 * L'ordre chronologique des étapes fait partie de ce contrat, pas seulement la
 * date de la première : `legsOf` accouple chaque étape à sa prévision avant de
 * trier, justement pour qu'un tri ne puisse jamais faire office de validation.
 * Sans cette exigence ici, une étape reculée ou redondante resterait
 * représentable, et se ferait réinterpréter en silence plus loin.
 *
 * `packed` fait partie du contrat au même titre, même vide : c'est le tableau
 * des clés déjà dans le sac, et rien plus loin ne revérifie sa forme avant de
 * le lire — `trip.packed.includes(...)` plante sur un voyage qui ne l'a
 * jamais eu, écrit par une version antérieure ou modifié à la main. Un
 * tableau vide reste accepté : une valise pas encore commencée est le cas
 * ordinaire, pas l'exception.
 *
 * Le nom de chaque étape compte autant que ses coordonnées : elles suffisent
 * à situer l'étape, mais c'est le nom qui titre l'écran. Absent ou réduit à
 * des espaces, l'écran afficherait `undefined` ou un blanc là où on attend le
 * nom de la ville.
 *
 * @param {unknown} trip
 * @returns {boolean}
 */
export function isTrip(trip) {
  if (!trip || typeof trip !== 'object') return false;

  const { id, start, end, stops, packed } = trip;
  if (!id || !start || !end) return false;
  if (!Array.isArray(packed)) return false;
  if (!Array.isArray(stops) || stops.length === 0) return false;

  // La première étape commence au départ, sans quoi le premier jour du séjour
  // n'aurait aucune ville à laquelle se rattacher.
  if (stops[0].from !== start) return false;

  // Chaque étape suivante doit avancer dans le temps : une date répétée ou
  // reculée ne décrit aucun voyage réel, et ce n'est pas à un tri de deviner
  // l'ordre qu'on a voulu dire.
  const inOrder = stops.every((stop, index) => index === 0 || stop.from > stops[index - 1].from);
  if (!inOrder) return false;

  return stops.every(
    (stop) =>
      typeof stop?.from === 'string' &&
      Number.isFinite(stop.place?.latitude) &&
      Number.isFinite(stop.place?.longitude) &&
      typeof stop.place?.name === 'string' &&
      stop.place.name.trim() !== '',
  );
}

/** Le lendemain d'une date ISO courte. Midi, pour ne pas glisser d'un jour. */
function nextDate(date) {
  const t = new Date(`${date}T12:00:00Z`).getTime() + 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Les dates de `from` à `to`, bornes incluses. */
function datesBetween(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = nextDate(date)) dates.push(date);
  return dates;
}

/**
 * Les étapes avec leurs bornes et leur prévision, déduites de la seule chose
 * que le voyage connaisse : le jour où l'on arrive dans chaque ville.
 *
 * Une étape court jusqu'à la veille de la suivante, la dernière jusqu'au retour.
 * C'est ce qui rend les trous et les chevauchements inexprimables : il n'y a
 * qu'une date par étape, donc rien à faire concorder.
 *
 * `forecasts` est accouplé à chaque étape *avant* le tri, par leur position
 * commune dans `trip.stops` telle que donnée. `isTrip` garantit déjà l'ordre
 * chronologique ; le tri qui suit n'est donc plus qu'une normalisation
 * défensive, jamais le moyen par lequel une étape trouve sa prévision — sans
 * quoi une étape mal ordonnée referait correspondre le mauvais accouplement
 * en silence.
 */
function legsOf(trip, forecasts) {
  const pairs = (trip.stops ?? []).map((stop, index) => ({
    stop,
    forecast: forecasts[index] ?? [],
  }));
  pairs.sort((a, b) => (a.stop.from < b.stop.from ? -1 : a.stop.from > b.stop.from ? 1 : 0));

  return pairs.map(({ stop, forecast }, index) => ({
    place: stop.place,
    from: stop.from,
    to: index + 1 < pairs.length ? previousDate(pairs[index + 1].stop.from) : trip.end,
    forecast,
  }));
}

/** La veille d'une date ISO courte. */
function previousDate(date) {
  const t = new Date(`${date}T12:00:00Z`).getTime() - 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Tous les combien on renouvelle une pièce, en jours de port.
 *
 * Les pièces portées à même la peau se changent chaque jour ; les autres
 * repartent pour deux ou trois jours. Ce n'est pas de la météo, c'est de
 * l'usage — d'où une table plutôt qu'une règle dans `rules.js`.
 */
const PERIODS = {
  't-shirt': 1,
  'sous-couche': 1,
  chemise: 3,
  pull: 3,
  short: 4,
  pantalon: 4,
  jean: 4,
};

/**
 * La période d'une racine que la table ne connaît pas — un palier ajouté plus
 * tard, un mot changé dans `rules.js`. Trois jours est le moins faux des
 * défauts : une pièce de trop vaut mieux qu'une pièce oubliée.
 */
const FALLBACK_PERIOD = 3;

/** Au-delà, on lave. Le plafond ne vaut que pour les pièces de peau. */
const DAILY_CAP = 7;

/**
 * La clé de la couche extérieure, et pourquoi ce n'est pas une racine.
 *
 * On n'emporte qu'une couche, toutes racines confondues. Si la clé était sa
 * racine, la prévision qui se précise ferait passer d'`imperméable` à
 * `manteau`, la clé changerait, et la coche tomberait — exactement ce que la
 * racine devait empêcher. Un seul crochet, quelle que soit la pièce qui y pend.
 */
const OUTER_KEY = 'couche';

/**
 * Les couches extérieures, de la plus couvrante à la moins.
 *
 * Le seul endroit du module où la couverture se lit dans une table : ces quatre
 * valeurs sont fixées par `rules.js` et ne se déduisent pas des températures —
 * un coupe-vent sort par 12 °C venteux, une veste par 6 °C calmes, et c'est
 * pourtant la veste qui tient le moins la pluie.
 */
const OUTER_ORDER = ['manteau', 'imperméable', 'coupe-vent', 'veste'];

/**
 * Les pièces d'une tenue, avec leur clé de regroupement.
 *
 * On garde le `dressedFor` de la journée : c'est lui qui dira, plus bas, lequel
 * de deux poids est le plus couvrant, sans table de noms à maintenir.
 */
function piecesOf(outfit) {
  const { top, bottom, outer } = outfit.layers;
  const portees = [...top, bottom].filter(Boolean).map((name) => ({
    key: garmentRoot(name),
    name,
  }));

  return outer ? [...portees, { key: OUTER_KEY, name: outer }] : portees;
}

/**
 * Combien d'exemplaires pour une racine, d'après les jours qui la réclament.
 *
 * Exportée pour être testée : la classe d'une racine est une décision d'usage,
 * et le repli sur la classe relais ne peut pas être atteint par une vraie
 * prévision — toutes les racines que `rules.js` produit sont dans la table.
 *
 * @returns {{count: number, capped: boolean}}
 */
export function quantityFor(key, dayCount) {
  if (key === OUTER_KEY) return { count: 1, capped: false };

  const period = PERIODS[key] ?? FALLBACK_PERIOD;
  const brut = Math.ceil(dayCount / period);
  const capped = period === 1 && brut > DAILY_CAP;

  return { count: capped ? DAILY_CAP : brut, capped };
}

/**
 * Les poids d'une racine, du plus couvrant au moins couvrant.
 *
 * Pour la couche extérieure, l'ordre est fixé (voir `OUTER_ORDER`). Pour le
 * reste, il se déduit des données : le poids demandé par la journée la plus
 * froide est le plus couvrant. Une table de noms complets aurait dû lister
 * « pull épais », « chemise légère », « pantalon léger ou jupe » et tout ce
 * qu'un futur palier ajoutera ; elle aurait pourri au premier mot changé.
 */
function byCoverage(key, variants) {
  if (key === OUTER_KEY) {
    return [...variants].sort(
      (a, b) => rankOf(a.name) - rankOf(b.name),
    );
  }

  return [...variants].sort((a, b) => a.coldest - b.coldest);
}

function rankOf(name) {
  const rang = OUTER_ORDER.indexOf(name);
  // Une couche inconnue de la table passe après celles qu'on connaît, plutôt
  // que de prendre la première place par accident.
  return rang === -1 ? OUTER_ORDER.length : rang;
}

/**
 * Nommer les exemplaires, du plus couvrant au moins couvrant.
 *
 * Un exemplaire, deux poids demandés : le plus épais l'emporte, car il couvre
 * la journée qui voulait le plus fin — l'inverse est faux. Deux exemplaires :
 * on prend les deux poids, et un séjour à grand écart reçoit naturellement son
 * pull fin et son pull épais, sans seuil réglé à l'œil. Les exemplaires en trop
 * répètent le plus couvrant.
 */
function namePieces(variants, count) {
  const pieces = new Map();

  for (let i = 0; i < count; i++) {
    const nom = (variants[i] ?? variants[0]).name;
    pieces.set(nom, (pieces.get(nom) ?? 0) + 1);
  }

  return [...pieces].map(([name, exemplaires]) => ({ name, count: exemplaires }));
}

/**
 * L'union des tenues : ce qu'on porte, et ce qu'on emporte.
 *
 * @param {object[]} days les journées produites par buildTrip
 * @returns {{wear: object[], carry: object[]}}
 */
function packItems(days) {
  const portes = new Map();
  const emportes = new Map();

  for (const jour of days) {
    for (const piece of piecesOf(jour.outfit)) {
      if (!portes.has(piece.key)) {
        portes.set(piece.key, { key: piece.key, days: [], variants: new Map() });
      }

      const groupe = portes.get(piece.key);
      groupe.days.push(jour.id);

      const variante = groupe.variants.get(piece.name) ?? {
        name: piece.name,
        coldest: Infinity,
      };
      variante.coldest = Math.min(variante.coldest, jour.outfit.dressedFor);
      groupe.variants.set(piece.name, variante);
    }

    for (const accessoire of jour.outfit.accessories) {
      if (!emportes.has(accessoire)) emportes.set(accessoire, { key: accessoire, days: [] });
      emportes.get(accessoire).days.push(jour.id);
    }
  }

  const wear = [...portes.values()].map((groupe) => {
    const { count, capped } = quantityFor(groupe.key, groupe.days.length);
    const variants = byCoverage(groupe.key, [...groupe.variants.values()]);

    return {
      key: groupe.key,
      count,
      pieces: namePieces(variants, count),
      days: groupe.days,
      capped,
    };
  });

  return { wear, carry: [...emportes.values()] };
}

/** Ordre d'affichage des risques, comme dans `phrasing.js`. */
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Les risques du séjour, un par sorte.
 *
 * Cinq notes de pluie pour cinq jours de pluie sont illisibles : on garde une
 * note par sorte, avec la liste des jours concernés. Le texte retenu est celui
 * du jour le plus sévère — on fait sa valise pour le pire jour, pas pour le
 * jour médian.
 *
 * Les horaires disparaissent. « Vers 14 h » a un sens le matin même ; sur une
 * liste faite trois jours plus tôt, c'est la date qui compte.
 */
function packNotes(days) {
  const parSorte = new Map();

  for (const jour of days) {
    for (const alert of jour.outfit.alerts) {
      const existante = parSorte.get(alert.kind);

      if (!existante) {
        parSorte.set(alert.kind, {
          kind: alert.kind,
          label: alert.label,
          text: alert.hint,
          severity: alert.severity,
          days: [jour.id],
        });
        continue;
      }

      existante.days.push(jour.id);

      if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[existante.severity]) {
        // Le pire jour donne le ton, et son libellé : « Neige » et « Pluie »
        // partagent la sorte `rain`, et c'est le moteur qui les distingue.
        existante.severity = alert.severity;
        existante.text = alert.hint;
        existante.label = alert.label;
      }
    }
  }

  return [...parSorte.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

/**
 * @param {object} trip le voyage : { id, start, end, stops, packed }
 * @param {object[][]} forecasts un tableau de DayWeather par étape, dans l'ordre
 *   des étapes. Une étape dont la requête a échoué passe un tableau vide.
 * @param {Date} at l'instant de consultation
 * @param {string|null} [profile] le vestiaire de qui lit, quand il l'a précisé
 * @returns {object} un Packing
 */
export function buildTrip(trip, forecasts, at = new Date(), profile = null) {
  const days = [];
  const covered = [];
  const missing = [];

  legsOf(trip, forecasts).forEach((leg) => {
    const parDate = new Map(leg.forecast.map((weather) => [weather.date, weather]));

    // « Aujourd'hui » se juge à la date du lieu de l'étape : un séjour à Tokyo
    // n'a pas la même date d'aujourd'hui qu'un téléphone à Paris. On prend le
    // décalage de la prévision quand on l'a, faute de quoi celui du premier
    // jour connu, faute de quoi zéro.
    const offset = leg.forecast[0]?.utcOffsetSeconds ?? 0;
    const aujourdhui = placeDate(at, offset);

    for (const date of datesBetween(leg.from, leg.to)) {
      // Les jours déjà vécus tombent : un séjour commencé ne parle que de ce
      // qui reste. Ils ne comptent pas non plus pour manquants — ils n'ont pas
      // manqué, ils sont passés.
      if (date < aujourdhui) continue;

      const weather = parDate.get(date);
      if (!weather) {
        missing.push(date);
        continue;
      }

      const outfit = buildOutfit(weather, profile);
      covered.push(date);
      days.push({
        id: date,
        label: dayLabel(date, date === aujourdhui),
        place: leg.place,
        weather,
        outfit,
        phrasing: describeDay(weather, outfit, at),
      });
    }
  });

  const { wear, carry } = packItems(days);

  return {
    trip,
    days,
    wear,
    carry,
    notes: packNotes(days),
    horizon: { covered, missing },
  };
}

/**
 * Ce qui est déjà dans le sac, posé sur la valise calculée.
 *
 * Hors de `buildTrip` à dessein : le calcul de valise ne sait rien de l'état du
 * sac, et reste donc testable sans coche.
 *
 * La coche porte sur la ligne et non sur l'exemplaire. « 7 t-shirts » se coche
 * une fois : sept gestes pour une ligne feraient de l'app un gestionnaire de
 * tâches, alors que la quantité est une information.
 *
 * @param {object} packing un Packing
 * @param {string[]} packed les clés déjà dans le sac
 */
export function applyPacked(packing, packed) {
  const cochees = new Set(packed);
  const marque = (item) => ({ ...item, packed: cochees.has(item.key) });

  const wear = packing.wear.map(marque);
  const carry = packing.carry.map(marque);
  const lignes = [...wear, ...carry];

  return {
    ...packing,
    wear,
    carry,
    progress: {
      done: lignes.filter((item) => item.packed).length,
      total: lignes.length,
    },
  };
}

/**
 * Les coches qui désignent encore quelque chose.
 *
 * Appelée à l'écriture : une clé devenue sans objet — le manteau d'un séjour
 * devenu estival — s'élague au lieu de dormir sur le disque et de recocher une
 * ligne qui réapparaîtrait des mois plus tard.
 *
 * @returns {string[]} les clés retenues, dans l'ordre reçu
 */
export function prunePacked(packing, packed) {
  const existantes = new Set([
    ...packing.wear.map((item) => item.key),
    ...packing.carry.map((item) => item.key),
  ]);

  return packed.filter((key) => existantes.has(key));
}
