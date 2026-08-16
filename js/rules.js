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
 *
 * Deux principes, tirés de ce que le barème précédent faisait mal.
 *
 * **Un palier ne doit jamais couvrir tout un climat.** Le premier allait de
 * 25 °C à l'infini : une journée à 36 et une journée à 26 recevaient le même
 * « t-shirt, short », et la réponse ne bougeait plus de tout l'été. Les paliers
 * se resserrent donc là où l'on s'habille vraiment, entre 5 et 30.
 *
 * **Le mot doit porter plus que le vêtement.** « Pull » ne dit pas s'il faut
 * celui de mi-saison ou celui de février ; « pull fin » et « pull épais » le
 * disent, sans coûter une ligne de plus. C'est là que se gagne la précision,
 * une fois qu'on s'interdit d'allonger la liste.
 *
 * **Jamais plus de quatre pièces.** Au-delà, ce n'est plus une réponse qu'on
 * saisit d'un regard, c'est un inventaire qu'on relit. Le grand froid perd donc
 * son t-shirt : sous une sous-couche thermique, il allait de soi.
 */
const TIERS = [
  { min: 30, top: ['t-shirt léger'], bottom: 'short', outer: null },
  { min: 25, top: ['t-shirt'], bottom: 'short', outer: null },
  { min: 21, top: ['t-shirt'], bottom: 'pantalon léger', outer: null },
  { min: 18, top: ['t-shirt', 'chemise légère'], bottom: 'pantalon léger', outer: null },
  { min: 15, top: ['t-shirt', 'chemise'], bottom: 'pantalon', outer: null },
  { min: 12, top: ['t-shirt', 'pull fin'], bottom: 'jean', outer: null },
  { min: 9, top: ['t-shirt', 'pull'], bottom: 'jean', outer: null },
  { min: 5, top: ['t-shirt', 'pull'], bottom: 'jean', outer: 'veste' },
  { min: 1, top: ['t-shirt', 'pull épais'], bottom: 'jean', outer: 'manteau' },
  {
    min: -Infinity,
    top: ['sous-couche thermique', 'pull épais'],
    bottom: 'pantalon doublé',
    outer: 'manteau',
  },
];

/** Le plafond que le barème s'impose, et que les tests tiennent. */
export const MAX_PIECES = 4;

/**
 * Le nom de tête d'une pièce, son qualificatif retiré.
 *
 * « pull fin », « pull », « pull épais » désignent le même objet de la
 * garde-robe, à des poids différents. Ce qui les distingue est un réglage, pas
 * un choix : on ne se demande pas s'il faut prendre un pull, on se demande
 * lequel. D'où ce dénominateur commun, dont `outfitIsRobust()` a besoin pour
 * juger si un désaccord entre modèles change vraiment ce qu'on sort du placard.
 *
 * @param {string} piece le nom complet d'une pièce
 * @returns {string} son nom de tête
 */
export function garmentRoot(piece) {
  return piece.split(' ')[0];
}

/*
 * Pas de chaussures.
 *
 * Le moteur en tenait un barème complet — sandales, baskets, bottines fourrées,
 * plus les semelles étanches sous l'averse et adhérentes sur le verglas. À
 * l'usage, personne n'attendait la page pour savoir qu'on met des baskets par
 * 18 °C : la ligne se lisait sans jamais rien changer, et allongeait d'autant
 * la tenue que l'on voulait saisir d'un regard.
 *
 * Ce qui comptait vraiment survit ailleurs : l'alerte `rain` dit qu'il va
 * pleuvoir, l'alerte `ice` dit de prendre des semelles qui accrochent. Le
 * conseil est resté, c'est l'inventaire qui est parti.
 */

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

/** En dessous de ce ressenti minimum, on prend de quoi couvrir le cou. */
const SCARF_TEMP = 5;

/** Au-dessus de ce ressenti maximum, on emporte de quoi tenir le soleil. */
const SUN_KIT_TEMP = 30;

/**
 * Ce qu'on emporte sans le porter.
 *
 * Cette ligne existait mais ne servait presque jamais : un parapluie, des
 * lunettes, et rien d'autre onze mois sur douze. Or c'est précisément ce qu'on
 * oublie en partant, et donc ce qu'une app du matin doit dire.
 *
 * Les accessoires suivent les extrêmes de la journée et non le point
 * d'habillage : une casquette et une gourde se glissent dans un sac, autant les
 * prendre pour l'heure la plus chaude ; une écharpe, pour la plus fraîche.
 */
function baseAccessories(weather) {
  const emporter = [];

  if (weather.feelsLikeMax >= SUN_KIT_TEMP) emporter.push('casquette', 'gourde');
  if (weather.feelsLikeMin < SCARF_TEMP) emporter.push('écharpe');
  // Gants et bonnet ne sortent qu'au gel : sous cinq degrés on a les mains dans
  // les poches, sous zéro on ne les a plus.
  if (weather.feelsLikeMin < 0) emporter.push('gants', 'bonnet');

  return emporter;
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
    },
    accessories: baseAccessories(weather),
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

/** La journée compte-t-elle comme humide ? */
function isWet(weather) {
  return weather.precipitationProbability >= 40 || weather.precipitationMm > 1;
}

/** Une averse qui trempe, par opposition à une qui mouille. */
function isHeavy(weather) {
  return weather.precipitationMm > 3 || weather.precipitationProbability >= 70;
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
    if (!isWet(weather)) return outfit;

    const heavy = isHeavy(weather);
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

    // Rien à changer dans la tenue : l'alerte porte tout le conseil, et c'est
    // elle qu'on lit avant de sortir.
    return withAlert(outfit, {
      kind: 'ice',
      label: 'Verglas',
      severity: 'high',
      hint: 'Sol potentiellement glissant, prends des semelles qui accrochent.',
    });
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
 * La comparaison porte sur les noms de tête, pas sur les noms complets. Depuis
 * que le barème qualifie ses pièces, ses frontières sont bien plus rapprochées,
 * et une comparaison littérale déclenchait la réserve presque tous les jours :
 * un degré d'écart suffisait à faire passer de « pull » à « pull fin ». Or ce
 * n'est pas une autre tenue, c'est le même pull. On ne prévient que lorsque le
 * désaccord change ce qu'on sort du placard.
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

  const racines = ({ top, bottom, outer }) => [
    ...top.map(garmentRoot),
    garmentRoot(bottom),
    outer && garmentRoot(outer),
  ];

  const bas = racines(decale(-ecart / 2).layers);
  const haut = racines(decale(ecart / 2).layers);

  return JSON.stringify(bas) === JSON.stringify(haut);
}
