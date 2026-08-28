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
  /**
   * L'échelle des ordonnées. `x` est l'abscisse où le tracé s'arrête : au-delà
   * commence la gouttière où se posent les degrés et le mot de la pluie.
   */
  scale: {
    x: number;
    degrees: { value: number; y: number; label: string }[];
  };
  peak: { x: number; y: number; hour: number; label: string };
  range: { min: number; max: number };
};

/** Une ville du séjour, et le jour où l'on y arrive. */
export type TripStop = {
  place: Place;
  from: string;
};

/**
 * Un voyage : une tranche de temps continue passée dans plusieurs villes.
 *
 * Une étape court de son `from` jusqu'au `from` de la suivante, ou jusqu'à
 * `end`. Les états absurdes — trou entre deux villes, chevauchement — ne sont
 * pas exprimables, donc il n'y a rien à valider.
 */
export type Trip = {
  id: string;
  start: string;
  end: string;
  stops: TripStop[];
  /** Les clés déjà dans le sac. Des racines de vêtement, plus `couche`. */
  packed: string[];
};

/** Une journée du séjour : la forme d'une journée de l'accueil, plus son lieu. */
export type TripDay = Omit<ForecastDay, 'isToday' | 'phrasing'> & {
  place: Place;
  phrasing: Omit<ForecastDay['phrasing'], 'versusYesterday' | 'later'>;
};

/**
 * Une ligne de la valise.
 *
 * `key` est la racine du vêtement — `garmentRoot()` —, sauf la couche
 * extérieure dont la clé est `couche` : c'est un seul crochet du placard, et la
 * pièce qui y pend change quand la prévision se précise.
 */
export type PackItem = {
  key: string;
  count: number;
  pieces: { name: string; count: number }[];
  days: string[];
  capped: boolean;
  /** Posé par `applyPacked`, absent du calcul brut. */
  packed?: boolean;
};

export type Packing = {
  trip: Trip;
  days: TripDay[];
  wear: PackItem[];
  carry: { key: string; days: string[]; packed?: boolean }[];
  notes: { kind: string; label: string; text: string; severity: string; days: string[] }[];
  horizon: { covered: string[]; missing: string[] };
  /** Posé par `applyPacked`. */
  progress?: { done: number; total: number };
};

/** La valise en mots. Aucune date ISO : l'écran ne formate rien. */
export type PackingWords = {
  title: string;
  dates: string;
  wear: { key: string; label: string; detail: string | null; why: string }[];
  carry: { key: string; label: string; why: string }[];
  notes: { label: string; text: string; when: string | null }[];
  confidence: string | null;
  horizon: string | null;
};
