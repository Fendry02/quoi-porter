export type Place = {
  name: string;
  latitude: number;
  longitude: number;
};

export type WidgetData = {
  place: string;
  outfit: string;
  temperature: string;
  attention: string | null;
};

/**
 * Une heure de la journée, telle que `js/weather.js` la normalise.
 *
 * L'enveloppe entre modèles est nulle en mono-modèle : il n'y a alors aucun
 * désaccord à représenter, et la bande d'incertitude du tracé disparaît.
 */
export type ForecastHour = {
  hour: number;
  temp: number;
  feelsLike: number;
  precipitationMm: number;
  precipitationProbability: number;
  windGustsKmh: number;
  feelsLikeLow: number | null;
  feelsLikeHigh: number | null;
};

export type DayWeather = {
  date: string;
  tempMin: number;
  tempMax: number;
  feelsLikeMin: number;
  feelsLikeMax: number;
  precipitationMm: number;
  precipitationProbability: number;
  windMaxKmh: number;
  windGustsKmh: number;
  uvIndex: number;
  weatherCode: number;
  sunrise: string;
  sunset: string;
  /** Sans lui, lever et coucher seraient comparés à l'heure du téléphone. */
  utcOffsetSeconds: number;
  hours: ForecastHour[];
  feelsLikeSpread: number | null;
};

export type ForecastDay = {
  id: string;
  isToday: boolean;
  label: string;
  weather: DayWeather;
  phrasing: {
    wear: string;
    carry: string | null;
    weather: string;
    confidence: string | null;
    notes: { label: string; text: string; when: string | null }[];
  };
};

/**
 * L'ambiance d'un ciel, telle que `js/sky.js` la produit. Aucun code WMO ni
 * température n'arrive jusqu'au rendu : tout est déjà traduit en paramètres.
 */
export type SkyMood = {
  name: string;
  /** Haut du dôme, bas du dôme, et l'encre lisible par-dessus. En hexadécimal. */
  zenith: string;
  horizon: string;
  ink: string;
  sunHeight: number;
  sunIntensity: number;
  starDensity: number;
  cloudCover: number;
  cloudSpeed: number;
  turbulence: number;
  haze: number;
  precipitation: { type: 'rain' | 'snow' | null; intensity: number };
  lightning: boolean;
};

/** Le déroulé d'une journée, en coordonnées normalisées (voir `VIEW`). */
export type TimelineGeometry = {
  points: { x: number; y: number; hour: number; feelsLike: number; probability: number }[];
  curve: string;
  area: string;
  band: string | null;
  bars: { x: number; y: number; width: number; height: number; hour: number; probability: number }[];
  ticks: { x: number; hour: number; label: string | null }[];
  peak: { x: number; y: number; hour: number; label: string };
  range: { min: number; max: number };
};
