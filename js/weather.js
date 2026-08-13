/**
 * Accès aux données Open-Meteo.
 *
 * L'API est gratuite, sans clé et sans inscription — il n'y a donc aucun secret
 * à protéger, et pas de backend à justifier.
 *
 * On interroge cinq centres de prévision d'un coup et on en prend la médiane :
 * plus robuste qu'un modèle isolé, et surtout leur désaccord nous dit quand la
 * prévision ne mérite pas confiance. Huit kilo-octets pour les cinq, deux jours
 * et cinq variables horaires — le coût est négligeable.
 *
 * La normalisation est séparée des appels réseau : `normalizeForecast` est pure
 * et testable, `fetchForecast` n'est qu'une enveloppe autour de fetch.
 */

import { median, spread, acrossModels } from './ensemble.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const DAILY_FIELDS = [
  'temperature_2m_min',
  'temperature_2m_max',
  'apparent_temperature_min',
  'apparent_temperature_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'windspeed_10m_max',
  'windgusts_10m_max',
  'uv_index_max',
  'weathercode',
  'sunrise',
  'sunset',
];

/**
 * Les centres de prévision interrogés. Cinq institutions distinctes, pas cinq
 * variantes d'un même modèle — c'est ce qui donne du sens à leur désaccord.
 *
 * Aucun ne publie toutes les variables : ECMWF n'a pas les rafales, Météo-France
 * et UKMO n'ont pas la probabilité de pluie. On agrège donc variable par
 * variable, sur les modèles qui répondent pour celle-là.
 */
export const MODELS = [
  'ecmwf_ifs025',
  'gfs_seamless',
  'meteofrance_seamless',
  'icon_seamless',
  'ukmo_seamless',
];

/** Variables horaires : de quoi tracer le déroulé de la journée. */
const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'precipitation_probability',
  'windgusts_10m',
];

/** Erreur métier, distincte d'une panne réseau, pour que l'UI puisse les différencier. */
export class WeatherError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WeatherError';
  }
}

/** Remplace null/undefined par une valeur neutre : rules.js n'a ainsi jamais à tester la nullité. */
function orDefault(value, fallback = 0) {
  return value === null || value === undefined ? fallback : value;
}

/**
 * Quels modèles ont réellement répondu dans cette réponse.
 *
 * Le repli mono-modèle renvoie des champs sans suffixe : on rend alors une
 * liste vide, et tout le reste continue de fonctionner sans savoir qu'il ne
 * lit qu'une source.
 */
function modelsPresent(payload) {
  // On balaie les deux blocs, et on cherche n'importe quel champ portant le
  // suffixe plutôt qu'un champ précis : se fier à une seule variable casserait
  // dès qu'un modèle cesse de la publier.
  const champs = [...Object.keys(payload.daily ?? {}), ...Object.keys(payload.hourly ?? {})];

  return MODELS.filter((m) => champs.some((champ) => champ.endsWith(`_${m}`)));
}

/**
 * Réponse Open-Meteo → tableau de DayWeather.
 *
 * @param {object} payload la réponse JSON brute
 * @returns {object[]} un DayWeather par jour
 */
/**
 * Le bloc horaire arrive à plat, deux jours bout à bout. On le regroupe par
 * date pour que chaque jour reparte avec les siennes.
 */
function hoursByDate(hourly, models) {
  const parJour = new Map();
  if (!hourly || !Array.isArray(hourly.time)) return parJour;

  const consensus = (variable, i) => median(acrossModels(hourly, variable, models, i));

  hourly.time.forEach((stamp, i) => {
    const date = stamp.slice(0, 10);
    const temp = orDefault(consensus('temperature_2m', i));
    const enveloppe = spread(acrossModels(hourly, 'apparent_temperature', models, i));

    if (!parJour.has(date)) parJour.set(date, []);
    parJour.get(date).push({
      hour: Number(stamp.slice(11, 13)),
      temp,
      // Sans ressenti, on retombe sur la température réelle plutôt que sur
      // zéro, qui ferait plonger la courbe à la verticale.
      feelsLike: orDefault(consensus('apparent_temperature', i), temp),
      precipitationMm: orDefault(consensus('precipitation', i)),
      precipitationProbability: orDefault(consensus('precipitation_probability', i)),
      windGustsKmh: orDefault(consensus('windgusts_10m', i)),
      // L'enveloppe entre modèles, pour la bande d'incertitude du tracé. Nulle
      // en mono-modèle : il n'y a alors aucun désaccord à représenter.
      feelsLikeLow: enveloppe?.low ?? null,
      feelsLikeHigh: enveloppe?.high ?? null,
    });
  });

  return parJour;
}

/**
 * Le désaccord typique de la journée, en degrés.
 *
 * La médiane des écarts horaires, pas leur maximum : une heure aberrante ne
 * doit pas faire passer une journée consensuelle pour incertaine.
 */
function spreadOfDay(hours) {
  const ecarts = hours
    .filter((h) => h.feelsLikeLow !== null && h.feelsLikeHigh !== null)
    .map((h) => h.feelsLikeHigh - h.feelsLikeLow);

  return ecarts.length > 0 ? median(ecarts) : null;
}

export function normalizeForecast(payload) {
  const daily = payload?.daily;
  if (!daily || !Array.isArray(daily.time)) {
    throw new WeatherError('Prévision illisible : le service n’a pas renvoyé de jours.');
  }

  const models = modelsPresent(payload);
  const heures = hoursByDate(payload.hourly, models);
  const consensus = (variable, i) => median(acrossModels(daily, variable, models, i));

  return daily.time.map((date, i) => {
    // Les rafales sont parfois absentes ; le vent moyen vaut mieux que zéro,
    // qui ferait passer une journée ventée pour calme.
    const windMaxKmh = orDefault(consensus('windspeed_10m_max', i));
    const windGustsKmh = orDefault(consensus('windgusts_10m_max', i), windMaxKmh);
    const hours = heures.get(date) ?? [];

    return {
      date,
      tempMin: orDefault(consensus('temperature_2m_min', i)),
      tempMax: orDefault(consensus('temperature_2m_max', i)),
      feelsLikeMin: orDefault(
        consensus('apparent_temperature_min', i),
        orDefault(consensus('temperature_2m_min', i)),
      ),
      feelsLikeMax: orDefault(
        consensus('apparent_temperature_max', i),
        orDefault(consensus('temperature_2m_max', i)),
      ),
      precipitationMm: orDefault(consensus('precipitation_sum', i)),
      precipitationProbability: orDefault(consensus('precipitation_probability_max', i)),
      windMaxKmh,
      windGustsKmh,
      uvIndex: orDefault(consensus('uv_index_max', i)),
      // Le code météo est une catégorie, pas une grandeur : une médiane de
      // codes n'aurait aucun sens. On prend celui du premier modèle qui parle.
      weatherCode: orDefault(acrossModels(daily, 'weathercode', models, i).find((c) => c != null)),
      // sky.js a besoin d'une plage de jour pour situer l'heure courante ;
      // sans elle il ne saurait pas distinguer midi de minuit.
      sunrise: orDefault(
        acrossModels(daily, 'sunrise', models, i).find((v) => v != null),
        `${date}T06:00`,
      ),
      sunset: orDefault(
        acrossModels(daily, 'sunset', models, i).find((v) => v != null),
        `${date}T20:00`,
      ),
      // Lever et coucher sont donnés en heure locale AU LIEU. Sans son
      // décalage, on les comparerait à l'heure du navigateur — faux dès qu'on
      // regarde une ville d'un autre fuseau.
      utcOffsetSeconds: orDefault(payload.utc_offset_seconds),
      hours,
      feelsLikeSpread: spreadOfDay(hours),
    };
  });
}

async function getJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new WeatherError('Pas de réseau, ou le service météo est injoignable.');
  }

  if (!response.ok) {
    throw new WeatherError(`Le service météo a répondu ${response.status}.`);
  }

  return response.json();
}

export function forecastUrl(latitude, longitude, models, forecastDays = 2) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('daily', DAILY_FIELDS.join(','));
  url.searchParams.set('hourly', HOURLY_FIELDS.join(','));
  url.searchParams.set('forecast_days', String(forecastDays));
  url.searchParams.set('timezone', 'auto');
  if (models.length > 0) url.searchParams.set('models', models.join(','));

  return url;
}

/**
 * Prévision agrégée sur cinq centres de prévision.
 *
 * En cas d'échec de la requête d'ensemble — un modèle retiré, une variable
 * renommée, une limite atteinte — on retombe sur une requête simple. Perdre la
 * mesure du désaccord vaut mieux qu'afficher une page en panne.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} [forecastDays=2] nombre de jours à demander
 * @returns {Promise<object[]>} un DayWeather par jour demandé
 */
export async function fetchForecast(latitude, longitude, forecastDays = 2) {
  try {
    return normalizeForecast(await getJson(forecastUrl(latitude, longitude, MODELS, forecastDays)));
  } catch (error) {
    console.warn('Ensemble multi-modèles indisponible, repli sur une source unique.', error);
    return normalizeForecast(await getJson(forecastUrl(latitude, longitude, [], forecastDays)));
  }
}

/**
 * Recherche de lieu par nom.
 *
 * @param {string} query
 * @returns {Promise<{name: string, latitude: number, longitude: number}[]>}
 */
export async function geocode(query) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'fr');

  const payload = await getJson(url);

  return (payload.results ?? []).map((place) => ({
    name: [place.name, place.admin1, place.country]
      .filter(Boolean)
      // Certaines entrées répètent la région dans le nom ; on évite « Paris, Paris, France ».
      .filter((part, i, parts) => parts.indexOf(part) === i)
      .join(', '),
    latitude: place.latitude,
    longitude: place.longitude,
  }));
}
