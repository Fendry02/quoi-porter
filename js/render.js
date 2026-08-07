/**
 * Rendu DOM. Seul module autorisé à toucher au document.
 *
 * Il ne prend aucune décision : rules.js décide de la tenue, phrasing.js la met
 * en mots, render.js se contente de les poser à l'écran.
 */

/** Code WMO → ambiance visuelle du panneau (voir styles.css). */
const SKIES = [
  { codes: [0, 1], sky: 'clear' },
  { codes: [2], sky: 'cloudy' },
  { codes: [3], sky: 'overcast' },
  { codes: [45, 48], sky: 'fog' },
  { codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], sky: 'rain' },
  { codes: [71, 73, 75, 77, 85, 86], sky: 'snow' },
  { codes: [95, 96, 99], sky: 'storm' },
];

/** Code WMO → libellé lisible. */
const CONDITIONS = new Map([
  [0, 'ciel dégagé'],
  [1, 'plutôt dégagé'],
  [2, 'partiellement nuageux'],
  [3, 'couvert'],
  [45, 'brouillard'],
  [48, 'brouillard givrant'],
  [51, 'bruine légère'],
  [53, 'bruine'],
  [55, 'bruine dense'],
  [56, 'bruine verglaçante'],
  [57, 'bruine verglaçante'],
  [61, 'pluie faible'],
  [63, 'pluie'],
  [65, 'forte pluie'],
  [66, 'pluie verglaçante'],
  [67, 'pluie verglaçante'],
  [71, 'neige faible'],
  [73, 'neige'],
  [75, 'forte neige'],
  [77, 'grains de neige'],
  [80, 'averses'],
  [81, 'averses'],
  [82, 'fortes averses'],
  [85, 'averses de neige'],
  [86, 'averses de neige'],
  [95, 'orage'],
  [96, 'orage et grêle'],
  [99, 'orage et grêle'],
]);

function skyFor(weatherCode) {
  return SKIES.find((entry) => entry.codes.includes(weatherCode))?.sky ?? 'cloudy';
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function measure(label, value) {
  const wrapper = element('div', 'day__measure');
  wrapper.append(element('dt', null, label), element('dd', null, value));
  return wrapper;
}

const round = (n) => Math.round(n);

/** Une décimale, virgule française. */
const decimal = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function buildStrip(weather) {
  const strip = element('dl', 'day__strip');

  strip.append(
    measure('Réel', `${round(weather.tempMin)}° → ${round(weather.tempMax)}°`),
    measure('Ressenti', `${round(weather.feelsLikeMin)}° → ${round(weather.feelsLikeMax)}°`),
    measure(
      'Pluie',
      `${round(weather.precipitationProbability)} % · ${decimal(weather.precipitationMm)} mm`,
    ),
    measure('Rafales', `${round(weather.windGustsKmh)} km/h`),
    measure('UV', `${round(weather.uvIndex)}`),
    measure('Ciel', CONDITIONS.get(weather.weatherCode) ?? '—'),
  );

  return strip;
}

/**
 * La phrase contient « 14 °C ressentis » : on met ce fragment en italique, car
 * c'est le chiffre dont découle toute la recommandation.
 */
function buildPhrase(headline) {
  const node = element('p', 'day__phrase');
  const match = headline.match(/(-?\d+\s*°C ressentis)/);

  if (!match) {
    node.textContent = headline;
    return node;
  }

  const [before, after] = headline.split(match[1]);
  node.append(before, element('em', null, match[1]), after);
  return node;
}

function buildDay(day, label, variant) {
  const article = element('article', `day day--${variant}`);
  article.dataset.sky = skyFor(day.weather.weatherCode);

  article.append(element('p', 'day__label', label), buildPhrase(day.phrasing.headline));

  if (day.phrasing.notes.length > 0) {
    const list = element('ul', 'day__notes');
    for (const note of day.phrasing.notes) list.append(element('li', null, note));
    article.append(list);
  }

  article.append(buildStrip(day.weather));
  return article;
}

/**
 * @param {HTMLElement} container
 * @param {{weather: object, outfit: object, phrasing: object}[]} days aujourd'hui puis demain
 */
export function renderDays(container, days) {
  const labels = ['Aujourd’hui', 'Demain'];
  const variants = ['today', 'tomorrow'];

  // Le masthead flotte au-dessus du ciel d'aujourd'hui : il lui faut la même
  // encre, sinon il devient illisible sur les ciels sombres.
  document.body.dataset.sky = skyFor(days[0].weather.weatherCode);

  container.replaceChildren(
    ...days.slice(0, 2).map((day, i) => buildDay(day, labels[i], variants[i])),
  );
}

export function renderLoading(container, place) {
  delete document.body.dataset.sky;

  const state = element('div', 'state');
  const skeleton = element('div', 'skeleton');
  skeleton.append(
    element('div', 'skeleton__bar'),
    element('div', 'skeleton__bar'),
    element('div', 'skeleton__bar'),
  );

  state.append(
    element('p', 'state__detail', place ? `Prévision pour ${place}…` : 'Recherche de la météo…'),
    skeleton,
  );
  container.replaceChildren(state);
}

/**
 * @param {HTMLElement} container
 * @param {{message: string, detail?: string, action?: {label: string, onClick: () => void}}} options
 */
export function renderState(container, { message, detail, action }) {
  delete document.body.dataset.sky;

  const state = element('div', 'state');
  state.append(element('p', 'state__message', message));

  if (detail) state.append(element('p', 'state__detail', detail));

  if (action) {
    const button = element('button', 'state__action', action.label);
    button.type = 'button';
    button.addEventListener('click', action.onClick);
    state.append(button);
  }

  container.replaceChildren(state);
}

/**
 * @param {HTMLElement} list
 * @param {{name: string, latitude: number, longitude: number}[]} places
 * @param {(place: object) => void} onPick
 */
export function renderPlaceResults(list, places, onPick) {
  list.replaceChildren(
    ...places.map((place) => {
      const item = document.createElement('li');
      const button = element('button', 'finder__result', place.name);
      button.type = 'button';
      button.addEventListener('click', () => onPick(place));
      item.append(button);
      return item;
    }),
  );
}
