/**
 * Rendu DOM. Seul module autorisé à toucher au document.
 *
 * Il ne prend aucune décision : rules.js décide de la tenue, phrasing.js la met
 * en mots, sky.js décide de l'ambiance, render.js se contente de poser tout ça
 * à l'écran.
 */

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

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const round = (n) => Math.round(n);

/** Une décimale, virgule française. */
const decimal = (n) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function measure(label, value) {
  const wrapper = element('div', 'day__measure');
  wrapper.append(element('dt', null, label), element('dd', null, value));
  return wrapper;
}

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

/**
 * @param {HTMLElement} article la section à remplir
 * @param {{weather: object, outfit: object, phrasing: object}} day
 * @param {string} label « Aujourd'hui » ou « Demain »
 */
export function renderDay(article, day, label) {
  const contenu = [element('p', 'day__label', label), buildPhrase(day.phrasing.headline)];

  if (day.phrasing.notes.length > 0) {
    const list = element('ul', 'day__notes');
    for (const note of day.phrasing.notes) list.append(element('li', null, note));
    contenu.push(list);
  }

  contenu.push(buildStrip(day.weather));
  article.replaceChildren(...contenu);
  article.hidden = false;
}

/**
 * L'essentiel de demain, lisible sans rien faire : c'est ce qui l'empêche
 * d'être relégué derrière une interaction.
 */
export function renderTeaser(button, day) {
  const { layers, dressedFor } = day.outfit;
  const piece = layers.outer ?? layers.top[layers.top.length - 1];

  button.replaceChildren(
    element('span', 'teaser__arrow', '↓'),
    element('span', null, `Demain · ${round(dressedFor)}° · ${piece}`),
  );
  button.hidden = false;
}

/**
 * @param {HTMLElement} container
 * @param {{message?: string, detail?: string, action?: {label: string, onClick: () => void}}} options
 */
export function renderState(container, { message, detail, action, skeleton }) {
  const contenu = [];

  if (message) contenu.push(element('p', 'state__message', message));
  if (detail) contenu.push(element('p', 'state__detail', detail));

  if (skeleton) {
    const bloc = element('div', 'skeleton');
    bloc.append(
      element('div', 'skeleton__bar'),
      element('div', 'skeleton__bar'),
      element('div', 'skeleton__bar'),
    );
    contenu.push(bloc);
  }

  if (action) {
    const button = element('button', 'state__action', action.label);
    button.type = 'button';
    button.addEventListener('click', action.onClick);
    contenu.push(button);
  }

  container.replaceChildren(...contenu);
  container.hidden = false;
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

/**
 * Accorde le texte au ciel : l'encre vient du mood, et le halo prend le parti
 * inverse pour que la phrase reste lisible quoi qu'il passe derrière.
 */
export function applyInk(ink) {
  if (!ink) return;

  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  document.documentElement.style.setProperty('--ink', ink);
  document.documentElement.style.setProperty(
    '--halo',
    // Encre claire → ciel sombre → halo sombre. Et réciproquement.
    luminance > 0.5 ? 'rgba(6, 10, 16, 0.42)' : 'rgba(255, 255, 255, 0.34)',
  );
}
