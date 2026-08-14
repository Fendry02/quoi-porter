export type Place = {
  name: string;
  latitude: number;
  longitude: number;
};

/**
 * Le vestiaire dans lequel piocher les propositions.
 *
 * `neutre` n'est pas une absence de réponse : c'est le choix de qui préfère
 * ne pas le dire, et il vaut la garde-robe commune. L'absence, elle, se note
 * `null` et rouvre la question.
 */
export type Profile = 'femme' | 'homme' | 'neutre';

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
  /** L'avis majoritaire des modèles, pas celui du premier à répondre. */
  weatherCode: number;
  /**
   * Le modèle isolé qui annonce nettement pire. Nul quand tout le monde
   * s'accorde : il n'y a alors aucune réserve à formuler.
   */
  conditionDissent: {
    family: 'cloud' | 'rain' | 'snow' | 'storm';
    code: number;
    count: number;
    total: number;
  } | null;
  sunrise: string;
  sunset: string;
  /** Sans lui, lever et coucher seraient comparés à l'heure du téléphone. */
  utcOffsetSeconds: number;
  hours: ForecastHour[];
  feelsLikeSpread: number | null;
};

/**
 * La tenue, couche par couche.
 *
 * L'app en a besoin en pièces détachées et non seulement en phrase : une liste
 * à virgules se lit, un empilement se voit.
 */
export type Outfit = {
  dressedFor: number;
  layers: {
    top: string[];
    bottom: string;
    outer: string | null;
    feet: string;
  };
  accessories: string[];
};

export type ForecastDay = {
  id: string;
  isToday: boolean;
  label: string;
  weather: DayWeather;
  outfit: Outfit;
  phrasing: {
    wear: string;
    carry: string | null;
    weather: string;
    /**
     * La même phrase en trois morceaux, pour que le nombre puisse rouler comme
     * un compteur au lieu d'être réécrit d'un coup.
     */
    weatherParts: { before: string; value: number; after: string };
    confidence: string | null;
    /** L'écart avec la veille. Nul les autres jours, et sans veille connue. */
    versusYesterday: string | null;
    /** Ce que la tenue du jour ne couvre pas. Nul quand elle tient jusqu'au soir. */
    later: string | null;
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
  /** Les rafales, mais seulement au-delà d'une brise : 0 tant qu'on ne sent rien. */
  wind: number;
  /** La chaleur écrasante, d'où le tremblement de l'air. */
  heat: number;
  /** 0 nouvelle lune, 0,5 pleine lune, et retour. */
  moonPhase: number;
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
