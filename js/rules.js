/**
 * Moteur de règles : DayWeather → Outfit.
 *
 * Module pur. Aucune dépendance au réseau ni au DOM, afin de rester testable
 * en isolation et réutilisable tel quel par le futur module valise.
 *
 * Deux principes guident le barème :
 *  - on décide sur le ressenti (apparent temperature), qui intègre déjà vent,
 *    humidité et rayonnement solaire ;
 *  - on habille pour le ressenti *minimum* du jour, car avoir froid est plus
 *    pénible qu'avoir un peu trop chaud et qu'une couche s'enlève.
 */

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
      severity: 'high',
      hint: 'Il gèle — couvre les extrémités, c’est là que ça pique.',
    });
  }

  if (weather.feelsLikeMax >= 30) {
    alerts.push({
      kind: 'heat',
      severity: weather.feelsLikeMax >= 35 ? 'high' : 'medium',
      hint: 'Grosse chaleur — bois régulièrement et évite le plein soleil l’après-midi.',
    });
  }

  return alerts;
}

function baseOutfit(weather) {
  const tier = TIERS.find((t) => weather.feelsLikeMin >= t.min);

  return {
    layers: {
      top: [...tier.top],
      bottom: tier.bottom,
      outer: tier.outer,
      feet: tier.feet,
    },
    accessories: weather.feelsLikeMin < 0 ? ['gants', 'bonnet'] : [],
    alerts: temperatureAlerts(weather),
  };
}

/** Ces couches extérieures coupent déjà le vent : inutile d'en ajouter une. */
const WINDPROOF_OUTERS = ['coupe-vent', 'imperméable', 'manteau'];

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

    // Un imperméable seul ne tient pas chaud : par grand froid on garde le
    // manteau et on laisse le parapluie s'occuper de l'eau.
    const outer = outfit.layers.outer === 'manteau' ? 'manteau' : 'imperméable';

    return withAlert(
      {
        ...outfit,
        layers: { ...outfit.layers, outer },
        // Un parapluie sous la neige ne sert à rien.
        accessories: snowing ? outfit.accessories : [...outfit.accessories, 'parapluie'],
      },
      {
        kind: 'rain',
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

    const outer = WINDPROOF_OUTERS.includes(outfit.layers.outer)
      ? outfit.layers.outer
      : 'coupe-vent';

    return withAlert(
      { ...outfit, layers: { ...outfit.layers, outer } },
      {
        kind: 'wind',
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
    if (weather.tempMax - weather.tempMin <= 10) return outfit;

    return withAlert(outfit, {
      kind: 'swing',
      severity: 'medium',
      hint: `${Math.round(weather.tempMax - weather.tempMin)}${NBSP}°C d’écart dans la journée : prévois de pouvoir enlever une couche.`,
    });
  },

  function uv(weather, outfit) {
    if (weather.uvIndex < 6) return outfit;

    return withAlert(
      { ...outfit, accessories: [...outfit.accessories, 'lunettes'] },
      {
        kind: 'uv',
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
export function buildOutfit(weather) {
  return MODIFIERS.reduce((outfit, modifier) => modifier(weather, outfit), baseOutfit(weather));
}
