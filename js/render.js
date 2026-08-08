/**
 * Rendu DOM. Seul module autorisé à toucher au document.
 *
 * Il ne prend aucune décision : rules.js décide de la tenue, phrasing.js la met
 * en mots, sky.js décide de l'ambiance, render.js se contente de poser tout ça
 * à l'écran.
 */

import { VIEW } from './timeline.js';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

/**
 * Le déroulé de la journée : le ressenti heure par heure, et la pluie dessous.
 *
 * C'est lui qui rend lisible un « 31 °C avec un peu de pluie » — tu vois que le
 * pic est à 16 h et l'averse à 19 h.
 *
 * @param {object} timeline la géométrie produite par buildTimeline
 * @param {string} label texte alternatif pour qui n'accède pas au graphique
 */
function buildChart(timeline, label) {
  const { width, height } = VIEW;
  const figure = element('figure', 'chart');

  const graph = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    class: 'chart__svg',
    role: 'img',
    'aria-label': label,
  });

  graph.append(
    svg('path', { d: timeline.area, class: 'chart__area' }),
    ...timeline.bars.map((b) =>
      svg('rect', { x: b.x, y: b.y, width: b.width, height: b.height, class: 'chart__rain' }),
    ),
    svg('path', { d: timeline.curve, class: 'chart__curve' }),
    svg('circle', { cx: timeline.peak.x, cy: timeline.peak.y, r: 1.1, class: 'chart__peak' }),
  );

  // Le texte vit en HTML plutôt qu'en SVG : le viewBox est étiré pour remplir
  // la largeur, ce qui déformerait les lettres s'il était dedans.
  const plot = element('div', 'chart__plot');
  plot.append(graph, buildPeakLabel(timeline.peak));

  const axis = element('figcaption', 'chart__axis');
  for (const tick of timeline.ticks) {
    const mark = element('span', 'chart__tick', tick.label);
    mark.style.left = `${tick.x}%`;
    axis.append(mark);
  }

  figure.append(plot, axis);
  return figure;
}

/**
 * La valeur du pic, seul chiffre porté par la courbe. Sans lui, le tracé
 * montre une forme sans jamais dire de combien elle monte.
 */
function buildPeakLabel(peak) {
  const label = element('span', 'chart__peak-label', peak.label);

  label.style.left = `${peak.x}%`;
  label.style.top = `${(peak.y / VIEW.height) * 100}%`;

  // Collé à un bord, un libellé centré déborderait : on le rabat vers l'intérieur.
  const alignement = peak.x < 12 ? '0' : peak.x > 88 ? '-100%' : '-50%';
  label.style.transform = `translate(${alignement}, -140%)`;

  return label;
}

/**
 * Décrit le déroulé en une phrase, pour les lecteurs d'écran et pour le cas où
 * le graphique ne s'affiche pas.
 */
function chartLabel(timeline) {
  const averses = timeline.bars.filter((b) => b.probability >= 40).map((b) => `${b.hour} h`);
  const debut = timeline.points[0].hour;
  const fin = timeline.points[timeline.points.length - 1].hour;

  const base =
    `Ressenti de ${debut} h à ${fin} h : de ${Math.round(timeline.range.min)}° ` +
    `à ${Math.round(timeline.range.max)}°, maximum vers ${timeline.peak.hour} h.`;

  return averses.length > 0 ? `${base} Pluie probable vers ${averses.join(', ')}.` : base;
}

/**
 * @param {HTMLElement} article la section à remplir
 * @param {{weather: object, outfit: object, phrasing: object, timeline: object|null}} day
 * @param {string} label « Aujourd'hui » ou « Demain »
 */
export function renderDay(article, day, label) {
  const contenu = [element('p', 'day__label', label), buildPhrase(day.phrasing.headline)];

  if (day.phrasing.notes.length > 0) {
    const list = element('ul', 'day__notes');
    for (const note of day.phrasing.notes) list.append(element('li', null, note));
    contenu.push(list);
  }

  // Absent en fin de soirée, quand il reste trop peu d'heures pour tracer
  // autre chose qu'un segment trompeur.
  if (day.timeline) contenu.push(buildChart(day.timeline, chartLabel(day.timeline)));

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
