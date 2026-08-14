/**
 * Ambiance céleste : (DayWeather, Date) → SkyMood.
 *
 * Module pur, troisième contrat du projet. Il isole complètement la scène 3D de
 * la météo : `scene/` ne connaît que des paramètres d'ambiance normalisés, et
 * ne sait rien des codes WMO.
 *
 * Tout découle d'un seul nombre continu, la hauteur de soleil, pour qu'aucune
 * transition ne se voie — un basculement discret entre « jour » et « nuit »
 * produirait un à-coup à l'écran.
 */

/** Familles de temps, par code WMO. La première qui correspond gagne. */
const FAMILIES = [
  { name: 'clear', codes: [0, 1] },
  { name: 'cloudy', codes: [2] },
  { name: 'overcast', codes: [3] },
  { name: 'fog', codes: [45, 48] },
  { name: 'snow', codes: [71, 73, 75, 77, 85, 86] },
  { name: 'storm', codes: [95, 96, 99] },
  { name: 'rain', codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82] },
];

/**
 * Palettes par famille et par moment. `zenith` est le haut du dôme, `horizon`
 * son bas, `ink` la couleur du texte posé dessus.
 *
 * Le crépuscule est décrit explicitement plutôt que calculé : c'est le moment
 * le plus beau de la journée, il mérite d'être réglé à la main.
 */
const PALETTES = {
  clear: {
    day: { zenith: '#4a90c4', horizon: '#cfe4ef', ink: '#12293d' },
    dusk: { zenith: '#3b4a76', horizon: '#f0a878', ink: '#1b1630' },
    night: { zenith: '#0c1327', horizon: '#28345a', ink: '#dde5f2' },
  },
  cloudy: {
    day: { zenith: '#7d9ab0', horizon: '#dfe6ea', ink: '#1c262e' },
    dusk: { zenith: '#4a4f6b', horizon: '#d99a7e', ink: '#1d1a2c' },
    night: { zenith: '#111823', horizon: '#2c3746', ink: '#d9dee6' },
  },
  overcast: {
    day: { zenith: '#8b959d', horizon: '#c8ced3', ink: '#171d22' },
    dusk: { zenith: '#4f5158', horizon: '#9d8a86', ink: '#1a1a1e' },
    night: { zenith: '#14181c', horizon: '#2a3138', ink: '#d2d6da' },
  },
  fog: {
    day: { zenith: '#b3b7b2', horizon: '#dcded9', ink: '#22261f' },
    dusk: { zenith: '#6e6a68', horizon: '#b5a49a', ink: '#1e1c1a' },
    night: { zenith: '#1a1d21', horizon: '#33383e', ink: '#ccd0d2' },
  },
  rain: {
    day: { zenith: '#2d3f4a', horizon: '#6b8089', ink: '#f0f4f6' },
    dusk: { zenith: '#22283c', horizon: '#6b5f6e', ink: '#eceef4' },
    night: { zenith: '#0d1119', horizon: '#212a35', ink: '#dbe2e8' },
  },
  snow: {
    day: { zenith: '#9fb0c6', horizon: '#eef1f6', ink: '#182339' },
    dusk: { zenith: '#4d5470', horizon: '#c3aebb', ink: '#191a2b' },
    night: { zenith: '#111731', horizon: '#2e3a56', ink: '#e4e9f2' },
  },
  storm: {
    day: { zenith: '#232333', horizon: '#4e4a5c', ink: '#f3f0f7' },
    dusk: { zenith: '#191627', horizon: '#4b3a4c', ink: '#f0ecf5' },
    night: { zenith: '#0a0b14', horizon: '#1e1b2d', ink: '#e6e2ee' },
  },
};

/** Couverture nuageuse typique par famille. */
const CLOUD_COVER = {
  clear: 0.08,
  cloudy: 0.38,
  overcast: 0.82,
  fog: 0.55,
  rain: 0.85,
  snow: 0.78,
  storm: 0.95,
};

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STORM_CODES = new Set([95, 96, 99]);

/** Durée, en minutes, sur laquelle la nuit s'installe après le coucher. */
const TWILIGHT_MINUTES = 120;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const lerp = (a, b, t) => a + (b - a) * t;

function familyOf(weatherCode) {
  return FAMILIES.find((f) => f.codes.includes(weatherCode))?.name ?? 'cloudy';
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Minutes depuis minuit, dans une heure locale Open-Meteo (« 2026-08-07T06:30 »).
 *
 * On lit la chaîne plutôt que de la donner à `Date` : ces horodatages n'ont pas
 * de fuseau, et `Date` les interpréterait dans celui du navigateur.
 */
function minutesOfDay(stamp) {
  const [, heures, minutes] = stamp.match(/T(\d{2}):(\d{2})/) ?? [];
  return Number(heures) * 60 + Number(minutes);
}

/** Minutes depuis minuit à l'endroit consulté, pour un instant donné. */
function placeMinutes(at, utcOffsetSeconds) {
  const total = Math.floor(at.getTime() / 60000) + utcOffsetSeconds / 60;
  return ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Écart circulaire entre deux minutes de la journée, au plus court. */
function circularDistance(a, b) {
  const brut = Math.abs(a - b);
  return Math.min(brut, MINUTES_PER_DAY - brut);
}

/**
 * Hauteur du soleil, continue.
 *
 * Entre le lever et le coucher, un demi-cycle sinusoïdal : 0 aux deux horizons,
 * 1 au milieu de la journée. En dehors, une descente vers -1 sur la durée du
 * crépuscule, puis la nuit pleine.
 *
 * Tout se calcule en minutes depuis minuit **à l'endroit consulté** : les
 * heures de lever et coucher que renvoie Open-Meteo sont locales au lieu, et
 * les comparer à l'heure du navigateur serait faux dès qu'on change de fuseau.
 *
 * @param {object} weather un DayWeather normalisé
 * @param {Date} at l'instant à représenter
 * @returns {number} entre -1 (nuit noire) et 1 (plein midi)
 */
export function sunHeightAt(weather, at) {
  const lever = minutesOfDay(weather.sunrise);
  const coucher = minutesOfDay(weather.sunset);
  const maintenant = placeMinutes(at, weather.utcOffsetSeconds ?? 0);

  if (maintenant >= lever && maintenant <= coucher) {
    return Math.sin((Math.PI * (maintenant - lever)) / (coucher - lever));
  }

  // Hors de la plage de jour : distance au plus proche des deux horizons, en
  // tenant compte du passage par minuit.
  const depuisLeJour = Math.min(
    circularDistance(maintenant, lever),
    circularDistance(maintenant, coucher),
  );

  return -clamp01(depuisLeJour / TWILIGHT_MINUTES);
}

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.round(clamp01(c / 255) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(a, b, t) {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  return rgbToHex([lerp(ra, rb, t), lerp(ga, gb, t), lerp(ba, bb, t)]);
}

function mixPalette(a, b, t) {
  return {
    zenith: mixHex(a.zenith, b.zenith, t),
    horizon: mixHex(a.horizon, b.horizon, t),
    ink: mixHex(a.ink, b.ink, t),
  };
}

/** Seuil au-dessus duquel la palette diurne est atteinte. */
const FULL_DAY = 0.35;
/** Seuil en dessous duquel la palette nocturne est atteinte. */
const FULL_NIGHT = -0.5;

function paletteFor(family, sunHeight) {
  const { day, dusk, night } = PALETTES[family];

  if (sunHeight >= FULL_DAY) return day;
  if (sunHeight >= 0) return mixPalette(dusk, day, sunHeight / FULL_DAY);
  if (sunHeight >= FULL_NIGHT) return mixPalette(dusk, night, sunHeight / FULL_NIGHT);
  return night;
}

function precipitationFor(weather) {
  const declenchee = weather.precipitationProbability >= 40 || weather.precipitationMm > 1;
  if (!declenchee) return { type: null, intensity: 0 };

  // Le cumul décrit mieux la densité visuelle que la probabilité, qui ne dit
  // que la chance d'avoir quelque chose.
  const parCumul = clamp01(weather.precipitationMm / 15);
  const parProba = clamp01(weather.precipitationProbability / 100);

  return {
    type: SNOW_CODES.has(weather.weatherCode) ? 'snow' : 'rain',
    intensity: clamp01(0.25 + 0.75 * Math.max(parCumul, parProba * 0.7)),
  };
}

/** Longueur du mois synodique, en jours. */
const SYNODIC_MONTH = 29.530588853;

/** Nouvelle lune de référence : 6 janvier 2000, 18 h 14 UTC. */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

/**
 * La phase de la lune, en fraction de cycle.
 *
 * 0 est la nouvelle lune, 0,5 la pleine lune, et on revient à 0. La scène en a
 * besoin pour dessiner le bon croissant du bon côté — une lune toujours pleine
 * serait le seul mensonge d'un ciel qui suit par ailleurs le lieu et l'heure.
 *
 * Le modèle est le cycle moyen, sans les perturbations de l'orbite réelle. Il
 * dérive de quelques heures au pire, ce qui ne se voit pas sur un croissant de
 * cinquante pixels.
 *
 * @param {string} date une date ISO courte, « 2026-08-07 »
 * @returns {number} dans [0, 1)
 */
export function moonPhaseOn(date) {
  const jours = (Date.parse(`${date}T00:00:00Z`) - NEW_MOON_EPOCH) / 86400000;

  // Une date illisible ne doit pas propager un NaN jusqu'aux uniformes : une
  // seule valeur non finie suffit à faire disparaître tout le ciel.
  if (!Number.isFinite(jours)) return 0.5;

  const cycles = jours / SYNODIC_MONTH;
  return cycles - Math.floor(cycles);
}

/**
 * Le vent, ramené entre 0 et 1 pour la scène.
 *
 * Il ne démarre qu'à 25 km/h de rafales : en dessous, un vent qu'on ne sent pas
 * ne doit pas se voir à l'écran. `cloudSpeed` continue de porter la dérive
 * douce des nuages ; celui-ci ne pilote que ce qu'on ne montre qu'en cas de
 * coup de vent — les traînées d'air.
 */
function windFor(weather) {
  return clamp01((weather.windGustsKmh - 25) / 45);
}

/**
 * La chaleur écrasante, ramenée entre 0 et 1.
 *
 * Sur le maximum et non sur le point d'habillage : l'air ne tremble qu'au plus
 * chaud de la journée, et c'est ce moment-là qu'on représente.
 */
function heatFor(weather) {
  return clamp01((weather.feelsLikeMax - 28) / 8);
}

/**
 * @param {object} weather un DayWeather normalisé
 * @param {Date} at l'instant à représenter
 * @returns {object} un SkyMood
 */
export function moodFor(weather, at) {
  const family = familyOf(weather.weatherCode);
  const sunHeight = sunHeightAt(weather, at);
  const palette = paletteFor(family, sunHeight);
  const cloudCover = CLOUD_COVER[family];

  return {
    name: family,
    ...palette,
    sunHeight,
    // Les nuages voilent l'astre sans jamais l'effacer complètement.
    sunIntensity: clamp01(Math.max(0, sunHeight) * (1 - cloudCover * 0.85)),
    // Les étoiles, elles, disparaissent bel et bien derrière une couche épaisse.
    starDensity: clamp01(Math.max(0, -sunHeight) * (1 - cloudCover) ** 2),
    cloudCover,
    cloudSpeed: clamp01(0.12 + weather.windMaxKmh / 60),
    turbulence: clamp01(weather.windGustsKmh / 80),
    haze: clamp01(family === 'fog' ? 0.9 : 0.08 + cloudCover * 0.35),
    wind: windFor(weather),
    heat: heatFor(weather),
    moonPhase: moonPhaseOn(weather.date),
    precipitation: precipitationFor(weather),
    lightning: STORM_CODES.has(weather.weatherCode),
  };
}

/** Grandeurs continues, interpolées linéairement. */
const BLENDED_NUMBERS = [
  'sunHeight',
  'sunIntensity',
  'starDensity',
  'cloudCover',
  'cloudSpeed',
  'turbulence',
  'haze',
  'wind',
  'heat',
];

/**
 * Mélange deux ambiances. C'est ce que le défilement appelle à chaque image :
 * la progression de 0 à 1 fait passer le ciel d'aujourd'hui à demain.
 *
 * @param {object} a l'ambiance de départ
 * @param {object} b celle d'arrivée
 * @param {number} t progression, bornée à [0, 1]
 * @returns {object} un SkyMood
 */
export function blendMoods(a, b, t) {
  const p = clamp01(t);
  if (p === 0) return a;
  if (p === 1) return b;

  // Le type de précipitation est discret — il n'existe pas de demi-flocon.
  // Il bascule à mi-parcours pendant que l'intensité, elle, se fond.
  const cible = p < 0.5 ? a : b;

  const mood = {
    name: cible.name,
    zenith: mixHex(a.zenith, b.zenith, p),
    horizon: mixHex(a.horizon, b.horizon, p),
    ink: mixHex(a.ink, b.ink, p),
    // La phase lunaire est discrète elle aussi, mais pour une autre raison que
    // le type de précipitation : interpoler 0,98 vers 0,01 ferait remonter la
    // lune tout un cycle à l'envers en une demi-seconde. Deux jours voisins ne
    // diffèrent que d'un trente-septième de croissant : la bascule ne se voit
    // pas, la traversée du cycle se verrait.
    moonPhase: cible.moonPhase,
    precipitation: {
      type: cible.precipitation.type,
      intensity: lerp(a.precipitation.intensity, b.precipitation.intensity, p),
    },
    // Un orage à l'une des deux extrémités doit pouvoir éclater pendant toute
    // la traversée, sinon les éclairs apparaîtraient d'un coup à mi-chemin.
    lightning: a.lightning || b.lightning,
  };

  for (const cle of BLENDED_NUMBERS) mood[cle] = lerp(a[cle], b[cle], p);

  return mood;
}
