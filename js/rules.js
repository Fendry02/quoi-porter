/**
 * Moteur de règles : DayWeather → Outfit.
 *
 * Module pur. Aucune dépendance au réseau ni au DOM, afin de rester testable
 * en isolation et réutilisable tel quel par le futur module valise.
 *
 * Deux principes guident le barème :
 *  - on décide sur le ressenti (apparent temperature), qui intègre déjà vent,
 *    humidité et rayonnement solaire ;
 *  - on habille pour un point situé entre le ressenti minimum et le maximum,
 *    biaisé vers le froid (voir COLD_BIAS).
 */

/**
 * Part de l'amplitude ajoutée au ressenti minimum pour obtenir le point
 * d'habillage.
 *
 * Viser le minimum seul serait trop prudent : une amplitude de 12 °C n'a rien
 * d'exceptionnel en mi-saison, et imposerait un pull des journées entières qui
 * montent à 27 °C. Viser la moyenne serait trop optimiste, car on sort souvent
 * le matin, au plus frais. À 0,4 le point reste sous la moyenne : le biais vers
 * le froid est conservé, sans la caricature.
 */
const COLD_BIAS = 0.4;

/**
 * Le ressenti pour lequel on habille effectivement.
 *
 * @param {object} weather un DayWeather normalisé
 * @returns {number} °C ressentis
 */
export function dressingPoint(weather) {
  const amplitude = weather.feelsLikeMax - weather.feelsLikeMin;
  return weather.feelsLikeMin + COLD_BIAS * Math.max(0, amplitude);
}

/**
 * Paliers du barème de base, du plus chaud au plus froid.
 * `min` est la borne inférieure incluse du palier.
 */
const TIERS = [
  { min: 25, top: ['t-shirt'], bottom: 'short', feet: 'baskets', outer: null },
  { min: 20, top: ['t-shirt'], bottom: 'pantalon léger', feet: 'baskets', outer: null },
  { min: 15, top: ['t-shirt', 'chemise'], bottom: 'pantalon', feet: 'baskets', outer: null },
  { min: 10, top: ['t-shirt', 'pull'], bottom: 'jean', feet: 'baskets', outer: null },
  { min: 5, top: ['t-shirt', 'pull'], bottom: 'jean', feet: 'baskets', outer: 'veste' },
  { min: 0, top: ['t-shirt', 'pull'], bottom: 'jean', feet: 'chaussures fermées', outer: 'manteau' },
  {
    min: -Infinity,
    top: ['sous-couche thermique', 't-shirt', 'pull'],
    bottom: 'jean',
    feet: 'chaussures fermées',
    outer: 'manteau',
  },
];

/** Alertes liées à la seule température, émises par le barème de base. */
function temperatureAlerts(weather) {
  const alerts = [];

  if (weather.feelsLikeMin < 0) {
    alerts.push({
      kind: 'cold',
      label: 'Gel',
      severity: 'high',
      hint: 'Il gèle — couvre les extrémités, c’est là que ça pique.',
    });
  }

  if (weather.feelsLikeMax >= 30) {
    alerts.push({
      kind: 'heat',
      label: 'Chaleur',
      severity: weather.feelsLikeMax >= 35 ? 'high' : 'medium',
      // Pas de moment dans la phrase : c'est la note datée qui le porte, et le
      // répéter ici donnerait « évite le plein soleil l'après-midi — vers 14 h ».
      hint: 'Grosse chaleur — bois régulièrement et cherche l’ombre.',
    });
  }

  return alerts;
}

function baseOutfit(weather) {
  const dressedFor = dressingPoint(weather);
  const tier = TIERS.find((t) => dressedFor >= t.min);

  return {
    dressedFor,
    layers: {
      top: [...tier.top],
      bottom: tier.bottom,
      outer: tier.outer,
      feet: tier.feet,
    },
    // Les extrémités, elles, subissent bien le minimum de la journée : gants et
    // bonnet se glissent dans une poche, autant les prendre s'il gèle au réveil.
    accessories: weather.feelsLikeMin < 0 ? ['gants', 'bonnet'] : [],
    alerts: temperatureAlerts(weather),
  };
}

/** Ces couches extérieures coupent déjà le vent : inutile d'en ajouter une. */
const WINDPROOF_OUTERS = ['coupe-vent', 'imperméable', 'manteau'];

/** Au-dessus de ce point d'habillage, le vent ne justifie plus de couche. */
const WIND_SHELL_MAX_TEMP = 20;

/** Au-dessus de ce point d'habillage, un imperméable ferait étuve. */
const RAIN_SHELL_MAX_TEMP = 25;

/** Codes WMO de chute de neige. 71/73/75 neige, 77 grains, 85/86 averses. */
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

/** Codes WMO de pluie verglaçante. */
const FREEZING_RAIN_CODES = new Set([66, 67]);

/** Sol potentiellement glissant : neige ou verglas. */
const SLIPPERY_CODES = new Set([...SNOW_CODES, ...FREEZING_RAIN_CODES]);

/** Espace insécable, pour ne pas séparer un nombre de son unité en fin de ligne. */
const NBSP = '\u00A0';

function withAlert(outfit, alert) {
  return { ...outfit, alerts: [...outfit.alerts, alert] };
}

/**
 * Modificateurs, appliqués dans cet ordre.
 *
 * L'ordre compte : `strongWind` doit passer après `rain` pour pouvoir retirer
 * le parapluie que celui-ci vient d'ajouter.
 *
 * Chacun prend (weather, outfit) et retourne un Outfit, sans muter l'entrée.
 */
const MODIFIERS = [
  function rain(weather, outfit) {
    if (weather.precipitationProbability < 40 && weather.precipitationMm <= 1) return outfit;

    const heavy = weather.precipitationMm > 3 || weather.precipitationProbability >= 70;
    const snowing = SNOW_CODES.has(weather.weatherCode);

    // Deux extrêmes où l'imperméable est le mauvais choix : par grand froid il
    // ne tient pas chaud (on garde le manteau), et par forte chaleur il fait
    // étuve (on se contente du parapluie). Entre les deux, il fait son office.
    const outer =
      outfit.dressedFor >= RAIN_SHELL_MAX_TEMP
        ? outfit.layers.outer
        : outfit.layers.outer === 'manteau'
          ? 'manteau'
          : 'imperméable';

    return withAlert(
      {
        ...outfit,
        layers: { ...outfit.layers, outer },
        // Un parapluie sous la neige ne sert à rien.
        accessories: snowing ? outfit.accessories : [...outfit.accessories, 'parapluie'],
      },
      {
        kind: 'rain',
        // Le moteur est le seul à savoir distinguer les deux : la frise et les
        // phrases se contentent de reprendre son mot.
        label: snowing ? 'Neige' : 'Pluie',
        severity: heavy ? 'high' : 'medium',
        hint: snowing
          ? heavy
            ? 'Il va bien neiger.'
            : 'Il pourrait neiger.'
          : heavy
            ? 'Il va bien pleuvoir.'
            : 'Il pourrait pleuvoir.',
      },
    );
  },

  function wind(weather, outfit) {
    if (weather.windGustsKmh < 40) return outfit;

    // Au-delà de ce seuil, le vent est rafraîchissant plutôt que pénible : on
    // signale les rafales, mais imposer un coupe-vent par 26°C serait absurde.
    const needsShell = outfit.dressedFor < WIND_SHELL_MAX_TEMP;

    const outer =
      !needsShell || WINDPROOF_OUTERS.includes(outfit.layers.outer)
        ? outfit.layers.outer
        : 'coupe-vent';

    return withAlert(
      { ...outfit, layers: { ...outfit.layers, outer } },
      {
        kind: 'wind',
        label: 'Vent',
        severity: 'medium',
        hint: `Ça souffle, ${Math.round(weather.windGustsKmh)}${NBSP}km/h en rafales.`,
      },
    );
  },

  function strongWind(weather, outfit) {
    if (weather.windGustsKmh < 60) return outfit;

    const hadUmbrella = outfit.accessories.includes('parapluie');

    return {
      ...outfit,
      accessories: outfit.accessories.filter((a) => a !== 'parapluie'),
      // On remplace l'alerte `wind` posée juste avant plutôt que d'en empiler une seconde.
      alerts: outfit.alerts.map((a) =>
        a.kind === 'wind'
          ? {
              ...a,
              severity: 'high',
              hint: hadUmbrella
                ? `Rafales à ${Math.round(weather.windGustsKmh)}${NBSP}km/h : laisse le parapluie, il ne tiendra pas. Capuche.`
                : `Rafales à ${Math.round(weather.windGustsKmh)}${NBSP}km/h, accroche-toi.`,
            }
          : a,
      ),
    };
  },

  function swing(weather, outfit) {
    // Sur le ressenti, comme le reste du moteur : un fort écart de température
    // réelle que le vent aplatit ne demande aucun ajustement.
    if (weather.feelsLikeMax - weather.feelsLikeMin <= 10) return outfit;

    // On a habillé pour un point intermédiaire : donner les deux bouts permet
    // de juger soi-même s'il faut une couche en plus au départ.
    return withAlert(outfit, {
      kind: 'swing',
      label: 'Amplitude',
      severity: 'medium',
      hint: `${Math.round(weather.feelsLikeMin)}${NBSP}°C au plus frais, ${Math.round(weather.feelsLikeMax)}${NBSP}°C au plus chaud — prévois de pouvoir ajuster.`,
    });
  },

  function uv(weather, outfit) {
    if (weather.uvIndex < 6) return outfit;

    return withAlert(
      { ...outfit, accessories: [...outfit.accessories, 'lunettes'] },
      {
        kind: 'uv',
        label: 'UV',
        severity: weather.uvIndex >= 8 ? 'high' : 'medium',
        hint: `UV à ${Math.round(weather.uvIndex)} — crème solaire si tu restes dehors.`,
      },
    );
  },

  function ice(weather, outfit) {
    if (!SLIPPERY_CODES.has(weather.weatherCode)) return outfit;

    return withAlert(
      { ...outfit, layers: { ...outfit.layers, feet: 'chaussures adhérentes' } },
      {
        kind: 'ice',
        label: 'Verglas',
        severity: 'high',
        hint: 'Sol potentiellement glissant, prends des semelles qui accrochent.',
      },
    );
  },
];

/**
 * @param {object} weather un DayWeather normalisé
 * @returns {object} un Outfit
 */
/**
 * Le bas proposé quand on porte des jupes, par temps qui s'y prête.
 *
 * On ajoute une option, on n'en retire aucune : l'app conseille une tenue, elle
 * ne décide pas de la garde-robe de qui la lit. En dessous de 15 °C rien ne
 * change — une jupe par 2 °C ne serait plus une option, ce serait un mauvais
 * conseil.
 */
const SKIRT_WEATHER = {
  short: 'short ou jupe',
  'pantalon léger': 'pantalon léger ou jupe',
  pantalon: 'pantalon ou jupe',
};

function withWardrobe(outfit, profile) {
  if (profile !== 'femme') return outfit;

  const bas = SKIRT_WEATHER[outfit.layers.bottom];
  if (!bas) return outfit;

  return { ...outfit, layers: { ...outfit.layers, bottom: bas } };
}

/**
 * @param {object} weather un DayWeather normalisé
 * @param {string|null} [profile] le vestiaire de qui lit, quand il l'a précisé
 */
export function buildOutfit(weather, profile = null) {
  const outfit = MODIFIERS.reduce(
    (courant, modifier) => modifier(weather, courant),
    baseOutfit(weather),
  );

  return withWardrobe(outfit, profile);
}

/**
 * La tenue tiendrait-elle si les modèles avaient raison à l'autre bout ?
 *
 * On habille au bas de la fourchette entre centres de prévision, puis au haut,
 * et on compare les vêtements obtenus. C'est la seule question qui compte :
 * un désaccord de 4 °C ne vaut d'être signalé que s'il franchit une frontière
 * du barème. Loin d'un palier, il ne change rien ; sur une frontière, il change
 * tout — et un seuil en degrés, lui, ne saurait pas faire la différence.
 *
 * @param {object} weather un DayWeather normalisé
 * @returns {boolean} vrai si la tenue ne dépend pas de quel modèle a raison
 */
export function outfitIsRobust(weather) {
  const ecart = weather.feelsLikeSpread;
  if (!ecart) return true;

  const decale = (delta) =>
    buildOutfit({
      ...weather,
      feelsLikeMin: weather.feelsLikeMin + delta,
      feelsLikeMax: weather.feelsLikeMax + delta,
    });

  const bas = decale(-ecart / 2).layers;
  const haut = decale(ecart / 2).layers;

  return JSON.stringify(bas) === JSON.stringify(haut);
}
