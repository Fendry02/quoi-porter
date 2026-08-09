/**
 * Rendu DOM. Seul module autorisé à toucher au document.
 *
 * Il ne prend aucune décision : rules.js décide de la tenue, phrasing.js la met
 * en mots, sky.js décide de l'ambiance, render.js se contente de poser tout ça
 * à l'écran.
 */

import { VIEW } from './timeline.js';
import { shortSpan } from './hours.js';

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
 * La tenue : la réponse à la question de la page, donc l'élément dominant.
 * Elle passe avant la météo, qui n'en est que la justification.
 */
function buildOutfitBlock(phrasing) {
  const bloc = element('div', 'day__outfit');
  bloc.append(element('p', 'day__wear', phrasing.wear));

  if (phrasing.carry) bloc.append(element('p', 'day__carry', phrasing.carry));

  return bloc;
}

/**
 * Les points d'attention, chacun précédé de son heure.
 *
 * L'horaire vient en tête plutôt qu'en queue : on parcourt la marge gauche et
 * on voit quand les choses arrivent, sans lire les phrases. Il passe en
 * monospace, comme toute mesure du projet, ce qui le détache du conseil sans
 * avoir besoin de gras ni de couleur.
 */
function buildNotes(notes) {
  const list = element('ul', 'day__notes');

  for (const note of notes) {
    const item = document.createElement('li');
    if (note.when) item.append(element('span', 'day__when', note.when));
    item.append(note.text);
    list.append(item);
  }

  return list;
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
function buildChart(timeline, label, events) {
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
    // La bande passe sous la courbe : c'est un contexte, pas une donnée.
    ...(timeline.band ? [svg('path', { d: timeline.band, class: 'chart__band' })] : []),
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

  // Un trait par heure, un nombre quand il y a la place. Le trait porte la
  // précision, le nombre la lecture : c'est lui qui permet de situer une barre
  // de la frise sans interpoler entre deux repères lointains.
  const axis = element('figcaption', 'chart__axis');
  for (const tick of timeline.ticks) {
    const repere = element('span', 'chart__tick');
    repere.style.left = `${tick.x}%`;
    repere.append(element('span', 'chart__mark'));
    if (tick.label) repere.append(element('span', 'chart__hour', tick.label));
    axis.append(repere);
  }

  figure.append(plot, axis);

  const frise = buildEvents(timeline, events);
  if (frise) figure.append(frise);

  return figure;
}

/**
 * La frise des événements, posée sous les repères horaires et sur la même
 * échelle que la courbe.
 *
 * Les notes disent déjà quand les choses arrivent, mais en mots : il faut les
 * lire une par une pour reconstituer la journée. Le même contenu posé sur l'axe
 * se saisit d'un coup — on voit que la pluie et le vent se chevauchent, ou que
 * le pic de chaleur tombe avant l'averse.
 *
 * @param {object} timeline la géométrie du tracé, pour convertir les heures en x
 * @param {object[]} events les notes qui portent une plage
 */
function buildEvents(timeline, events) {
  if (events.length === 0) return null;

  // On reprend les abscisses exactes des points du tracé plutôt que de refaire
  // le calcul : une heure y est un point, pas une case, et un barème parallèle
  // décalerait la frise de quelques pixels par rapport aux repères horaires.
  const xParHeure = new Map(timeline.points.map((p) => [p.hour, p.x]));
  const premiere = timeline.points[0].hour;
  const derniere = timeline.points[timeline.points.length - 1].hour;

  const bloc = element('div', 'events');

  for (const event of events) {
    const debut = Math.max(event.span.from, premiere);
    const fin = Math.min(event.span.to, derniere);
    if (fin < debut) continue;

    const x1 = xParHeure.get(debut);
    const x2 = xParHeure.get(fin);
    if (x1 === undefined || x2 === undefined) continue;

    const ligne = element('div', 'events__row');
    const barre = element('span', 'events__bar');
    const instant = x2 - x1 < 0.5;

    barre.style.left = `${x1}%`;
    if (instant) {
      // Un événement d'un instant n'a pas de largeur : on le centre sur son
      // heure plutôt que de lui en inventer une.
      barre.classList.add('events__bar--point');
    } else {
      barre.style.width = `${x2 - x1}%`;
    }

    // Le libellé porte son horodatage : sans lui, la barre dit « quoi » et
    // « combien de temps » mais jamais « quand », et il faut redescendre à
    // l'axe pour interpoler entre deux repères espacés de quatre heures.
    // Ce sont les heures bornées à la fenêtre, celles que la barre dessine
    // réellement — l'horodatage ne peut pas contredire le trait qu'il légende.
    const libelle = element('span', 'events__label', event.label);
    libelle.append(element('span', 'events__hour', shortSpan({ from: debut, to: fin })));

    // Où le poser se décide après disposition, dans placeEventLabels : il y
    // faut la largeur réelle du libellé, qu'on ne connaît pas encore.
    ligne.dataset.from = x1;
    ligne.dataset.to = x2;

    ligne.append(barre, libelle);
    bloc.append(ligne);
  }

  return bloc.children.length > 0 ? bloc : null;
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

  if (timeline.band) {
    return averses.length > 0
      ? `${base} Pluie probable vers ${averses.join(', ')}. La zone claire montre l’écart entre modèles.`
      : `${base} La zone claire montre l’écart entre modèles.`;
  }

  return averses.length > 0 ? `${base} Pluie probable vers ${averses.join(', ')}.` : base;
}

/**
 * @param {HTMLElement} article la section à remplir
 * @param {{weather: object, outfit: object, phrasing: object, timeline: object|null}} day
 * @param {string} label « Aujourd'hui » ou « Demain »
 */
export function renderDay(article, day, label) {
  const contenu = [
    element('p', 'day__label', label),
    buildOutfitBlock(day.phrasing),
    element('p', 'day__weather', day.phrasing.weather),
  ];

  // L'avertissement porte sur la prévision, pas sur le temps : il se place
  // avec la phrase météo, jamais parmi les points d'attention.
  if (day.phrasing.confidence) {
    contenu.push(element('p', 'day__confidence', day.phrasing.confidence));
  }

  if (day.phrasing.notes.length > 0) contenu.push(buildNotes(day.phrasing.notes));

  // Absent en fin de soirée, quand il reste trop peu d'heures pour tracer
  // autre chose qu'un segment trompeur.
  if (day.timeline) {
    // Seules les notes qui savent quand elles arrivent peuvent se poser sur
    // l'axe ; les autres — l'amplitude, l'UV — restent du texte.
    const events = day.phrasing.notes.filter((n) => n.span);
    contenu.push(buildChart(day.timeline, chartLabel(day.timeline), events));
  }

  contenu.push(buildStrip(day.weather));
  article.replaceChildren(...contenu);
  article.hidden = false;

  // Même tâche que l'insertion : aucun rendu ne s'intercale, les libellés ne
  // sont jamais peints à leur position par défaut.
  placeEventLabels(article);
}

/** Espace entre une barre et son libellé, en pixels. */
const LABEL_GAP = 5;

/**
 * Place les libellés de la frise, une fois la page disposée.
 *
 * Impossible de le décider en construisant le DOM : il y faut la largeur réelle
 * du libellé et celle du tracé, qui dépendent de la police chargée et de la
 * fenêtre.
 *
 * Trois positions, par ordre de préférence. Après la barre — c'est le sens de
 * lecture. Avant, quand la fin de la barre serre trop le bord droit. Au-dessus
 * en dernier recours : une barre qui couvre toute la fenêtre ne laisse de place
 * d'aucun côté.
 *
 * C'est ce dernier cas que l'ancienne règle manquait. Elle basculait sur la
 * seule fin de la barre, sans vérifier qu'il y avait de quoi l'accueillir à
 * gauche — et un « gel toute la journée » partait alors hors du cadre.
 *
 * @param {ParentNode} root la portion de page à replacer
 */
export function placeEventLabels(root) {
  for (const chart of root.querySelectorAll('.chart')) {
    const largeur = chart.getBoundingClientRect().width;
    // Onglet caché ou page pas encore disposée : mesurer ne donnerait que des
    // zéros. On replacera au prochain redimensionnement.
    if (largeur === 0) continue;

    for (const ligne of chart.querySelectorAll('.events__row')) {
      const libelle = ligne.querySelector('.events__label');
      const depart = Number(ligne.dataset.from);
      const fin = Number(ligne.dataset.to);

      // On repart de zéro : la mesure doit porter sur le libellé, pas sur le
      // placement qu'on lui avait donné à la fenêtre précédente.
      libelle.classList.remove('events__label--before');
      ligne.classList.remove('events__row--stacked');
      libelle.style.left = '';
      libelle.style.right = '';

      const besoin = libelle.getBoundingClientRect().width + LABEL_GAP;
      const apres = largeur - (fin / 100) * largeur;
      const avant = (depart / 100) * largeur;

      if (besoin <= apres) {
        libelle.style.left = `${fin}%`;
      } else if (besoin <= avant) {
        libelle.style.right = `${100 - depart}%`;
        libelle.classList.add('events__label--before');
      } else {
        // Au-dessus, aligné sur le début de la barre — et ramené dans le cadre
        // si même de là il dépassait.
        ligne.classList.add('events__row--stacked');
        libelle.style.left = `${Math.min(avant, Math.max(0, largeur - besoin))}px`;
      }
    }
  }
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
