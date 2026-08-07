/**
 * Accès aux données Open-Meteo.
 *
 * L'API est gratuite, sans clé et sans inscription — il n'y a donc aucun secret
 * à protéger, et pas de backend à justifier.
 *
 * La normalisation est séparée des appels réseau : `normalizeForecast` est pure
 * et testable, `fetchForecast` n'est qu'une enveloppe autour de fetch.
 */

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
 * Réponse Open-Meteo → tableau de DayWeather.
 *
 * @param {object} payload la réponse JSON brute
 * @returns {object[]} un DayWeather par jour
 */
export function normalizeForecast(payload) {
  const daily = payload?.daily;
  if (!daily || !Array.isArray(daily.time)) {
    throw new WeatherError('Prévision illisible : le service n’a pas renvoyé de jours.');
  }

  return daily.time.map((date, i) => {
    // Les rafales sont parfois absentes ; le vent moyen vaut mieux que zéro,
    // qui ferait passer une journée ventée pour calme.
    const windMaxKmh = orDefault(daily.windspeed_10m_max?.[i]);
    const windGustsKmh = orDefault(daily.windgusts_10m_max?.[i], windMaxKmh);

    return {
      date,
      tempMin: orDefault(daily.temperature_2m_min?.[i]),
      tempMax: orDefault(daily.temperature_2m_max?.[i]),
      feelsLikeMin: orDefault(
        daily.apparent_temperature_min?.[i],
        orDefault(daily.temperature_2m_min?.[i]),
      ),
      feelsLikeMax: orDefault(
        daily.apparent_temperature_max?.[i],
        orDefault(daily.temperature_2m_max?.[i]),
      ),
      precipitationMm: orDefault(daily.precipitation_sum?.[i]),
      precipitationProbability: orDefault(daily.precipitation_probability_max?.[i]),
      windMaxKmh,
      windGustsKmh,
      uvIndex: orDefault(daily.uv_index_max?.[i]),
      weatherCode: orDefault(daily.weathercode?.[i]),
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

/**
 * Prévision pour aujourd'hui et demain.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object[]>} deux DayWeather
 */
export async function fetchForecast(latitude, longitude) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('daily', DAILY_FIELDS.join(','));
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'auto');

  return normalizeForecast(await getJson(url));
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
