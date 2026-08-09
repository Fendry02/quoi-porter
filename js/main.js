/**
 * Orchestration : résoudre le lieu, chercher la météo, décider la tenue, la
 * mettre en mots, choisir l'ambiance, et relier le défilement à la scène.
 */

import { fetchForecast, geocode, WeatherError } from './weather.js';
import { buildOutfit } from './rules.js';
import { describeDay } from './phrasing.js';
import { moodFor, blendMoods } from './sky.js';
import { buildTimeline } from './timeline.js';
import {
  renderDay,
  renderTeaser,
  renderState,
  renderPlaceResults,
  applyInk,
  placeEventLabels,
} from './render.js';

const STORAGE_KEY = 'weather-clothes.place';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Au-delà de ce délai, la prévision affichée n'est plus de confiance : l'heure
 * a bougé, donc la fenêtre de la courbe et la hauteur du soleil aussi, et le
 * jour a pu changer de date.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;

const canvas = document.getElementById('sky');
const track = document.getElementById('track');
const stage = document.getElementById('stage');
const todayEl = document.getElementById('day-today');
const tomorrowEl = document.getElementById('day-tomorrow');
const stateEl = document.getElementById('state');
const teaser = document.getElementById('teaser');
const placeToggle = document.getElementById('place-toggle');
const placeName = document.getElementById('place-name');
const placePanel = document.getElementById('place-panel');
const placeForm = document.getElementById('place-form');
const placeInput = document.getElementById('place-input');
const placeStatus = document.getElementById('place-status');
const placeResults = document.getElementById('place-results');

/** La scène 3D, ou null si elle n'a pas pu se charger. */
let scene = null;
/** Les deux ambiances entre lesquelles le défilement fait la navette. */
let moods = null;
/** Le lieu affiché, pour pouvoir se rafraîchir sans le redemander. */
let currentPlace = null;
/** Horodatage du dernier affichage réussi. */
let lastRenderedAt = 0;

/* ------------------------------------------------------------------ lieu */

function readStoredPlace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const place = JSON.parse(raw);
    return Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude) ? place : null;
  } catch {
    // localStorage indisponible (navigation privée, quota) : on continue sans.
    return null;
  }
}

function storePlace(place) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  } catch {
    // Ne pas pouvoir mémoriser le lieu n'empêche pas d'afficher la météo.
  }
}

/** Géolocalisation navigateur. Résout à null si elle est refusée ou indisponible. */
function locate() {
  if (!navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({ name: 'Ma position', latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 15 * 60 * 1000 },
    );
  });
}

/* ----------------------------------------------------------- défilement */

/** Progression de 0 (aujourd'hui) à 1 (demain). */
function scrollProgress() {
  const parcours = document.documentElement.scrollHeight - window.innerHeight;
  return parcours <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / parcours));
}

/**
 * Le fondu croisé. Aujourd'hui s'efface sur la première moitié, demain
 * apparaît sur la seconde — jamais les deux à pleine opacité, sinon les deux
 * textes se superposeraient.
 */
function crossFade(t) {
  const sortie = Math.min(1, t / 0.45);
  const entree = Math.max(0, (t - 0.55) / 0.45);

  todayEl.style.opacity = String(1 - sortie);
  todayEl.style.transform = `translateY(${-t * 18}px)`;
  tomorrowEl.style.opacity = String(entree);
  tomorrowEl.style.transform = `translateY(${(1 - t) * 18}px)`;

  // Le pointeur ne doit atteindre que le jour effectivement lisible.
  todayEl.style.pointerEvents = t < 0.5 ? 'auto' : 'none';
  tomorrowEl.style.pointerEvents = t < 0.5 ? 'none' : 'auto';

  teaser.style.opacity = String(1 - sortie);
  teaser.style.pointerEvents = t < 0.3 ? 'auto' : 'none';
}

function onScroll() {
  const t = scrollProgress();

  crossFade(t);

  if (scene) {
    scene.setProgress(t);
    applyInk(scene.inkColor());
  } else if (moods) {
    // Sans scène 3D, l'encre et le dégradé de repli suivent quand même le ciel.
    const mood = blendMoods(moods[0], moods[1], t);
    applyInk(mood.ink);
    document.body.style.background = `linear-gradient(158deg, ${mood.zenith}, ${mood.horizon})`;
  }
}

/* --------------------------------------------------------------- scène */

/**
 * Chargement paresseux et facultatif du moteur 3D. Un échec — CDN injoignable,
 * WebGL absent, pilote sur liste noire — ne doit jamais empêcher de lire la
 * météo : on retombe sur le dégradé CSS.
 */
async function loadScene() {
  try {
    const { createScene } = await import('./scene/index.js');
    return createScene(canvas);
  } catch (error) {
    console.warn('Scène 3D indisponible, repli sur le dégradé.', error);
    return null;
  }
}

/**
 * La scène arrive souvent après la météo, puisque les deux partent ensemble.
 * On lui donne alors les ambiances déjà calculées.
 */
function attachScene() {
  if (!scene || !moods) return;

  scene.setMoods(moods[0], moods[1]);
  scene.start();
  onScroll();
}

/* --------------------------------------------------------------- affichage */

function showDays(forecast, { silent = false } = {}) {
  const now = new Date();

  const days = forecast.slice(0, 2).map((weather) => {
    const outfit = buildOutfit(weather);
    return {
      weather,
      outfit,
      phrasing: describeDay(weather, outfit, now),
      timeline: buildTimeline(weather, now),
    };
  });

  stateEl.hidden = true;

  // L'animation d'arrivée n'appartient qu'au premier affichage. Il faut retirer
  // la classe *avant* de remplacer les enfants : le sélecteur porte sur eux, et
  // des enfants neufs sous une classe encore posée rejoueraient l'animation.
  todayEl.classList.toggle('day--enter', !silent);

  renderDay(todayEl, days[0], 'Aujourd’hui');
  renderDay(tomorrowEl, days[1], 'Demain');
  renderTeaser(teaser, days[1]);

  // Demain est montré à la même heure qu'il est maintenant : on compare deux
  // matins, ou deux nuits, jamais un matin et une nuit.
  moods = [moodFor(days[0].weather, now), moodFor(days[1].weather, new Date(now.getTime() + DAY_MS))];

  attachScene();
  track.style.display = '';
  lastRenderedAt = Date.now();
  onScroll();
}

/**
 * @param {object} place
 * @param {{silent?: boolean}} options `silent` garde le contenu à l'écran
 *   pendant la requête, pour qu'un rafraîchissement de fond ne fasse pas
 *   clignoter le squelette.
 */
async function show(place, { silent = false } = {}) {
  currentPlace = place;
  placeName.textContent = place.name;

  if (!silent) {
    todayEl.hidden = true;
    tomorrowEl.hidden = true;
    teaser.hidden = true;
    track.style.display = 'none';
    renderState(stateEl, { detail: `Prévision pour ${place.name}…`, skeleton: true });
  }

  try {
    showDays(await fetchForecast(place.latitude, place.longitude), { silent });
  } catch (error) {
    // Un rafraîchissement de fond qui échoue ne doit pas effacer une prévision
    // encore lisible : on garde l'écran tel quel et on réessaiera plus tard.
    if (silent) return;

    renderState(stateEl, {
      message: 'Impossible de récupérer la météo.',
      detail:
        error instanceof WeatherError
          ? error.message
          : 'Une erreur inattendue est survenue pendant la récupération.',
      action: { label: 'Réessayer', onClick: () => show(place) },
    });
  }
}

/**
 * Revalidation. Sans elle, une page laissée ouverte le matin conseille encore
 * la tenue du matin le soir venu, sous un ciel figé à l'aube.
 *
 * On refait la requête plutôt que de seulement recalculer l'heure : après
 * minuit, le « jour 0 » de la prévision est devenu la veille.
 */
function refreshIfStale() {
  if (document.hidden || !currentPlace) return;
  // Tant que rien n'a été affiché, `lastRenderedAt` vaut zéro et tout paraît
  // périmé : un événement de focus pendant la requête initiale déclencherait
  // un second appel et effacerait l'animation d'arrivée.
  if (lastRenderedAt === 0) return;
  if (Date.now() - lastRenderedAt < STALE_AFTER_MS) return;

  show(currentPlace, { silent: true });
}

document.addEventListener('visibilitychange', refreshIfStale);
window.addEventListener('focus', refreshIfStale);

// On sonde bien plus souvent que le seuil : sonder à la même période ne
// déclencherait qu'un tick sur deux, et la cadence réelle vaudrait le double.
setInterval(refreshIfStale, 60 * 1000);

function selectPlace(place) {
  storePlace(place);
  closeFinder();
  window.scrollTo({ top: 0, behavior: 'auto' });
  show(place);
}

/** Aucun lieu connu : on invite à en choisir un, sans traiter ça comme une panne. */
function askForPlace() {
  renderState(stateEl, {
    message: 'D’abord, où es-tu ?',
    detail:
      'La géolocalisation n’est pas disponible ou a été refusée. Cherche ta ville pour commencer.',
    action: { label: 'Chercher une ville', onClick: openFinder },
  });
}

/* ----------------------------------------------------------- recherche */

function openFinder() {
  placePanel.hidden = false;
  placeToggle.setAttribute('aria-expanded', 'true');
  placeInput.focus();
}

function closeFinder() {
  placePanel.hidden = true;
  placeToggle.setAttribute('aria-expanded', 'false');
  placeStatus.textContent = '';
  placeResults.replaceChildren();
}

placeToggle.addEventListener('click', () => {
  if (placePanel.hidden) openFinder();
  else closeFinder();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !placePanel.hidden) {
    closeFinder();
    placeToggle.focus();
  }
});

placeForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const query = placeInput.value.trim();
  if (!query) return;

  placeStatus.textContent = 'Recherche…';
  placeResults.replaceChildren();

  try {
    const places = await geocode(query);

    if (places.length === 0) {
      placeStatus.textContent = `Aucun lieu ne correspond à « ${query} ». Essaie une autre orthographe.`;
      return;
    }

    placeStatus.textContent = '';
    renderPlaceResults(placeResults, places, selectPlace);
  } catch (error) {
    placeStatus.textContent =
      error instanceof WeatherError ? error.message : 'La recherche a échoué.';
  }
});

teaser.addEventListener('click', () => {
  window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
});

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => {
  onScroll();
  // Le placement des libellés de la frise dépend de la largeur du tracé :
  // mesuré une fois pour toutes, il serait faux dès le premier redimensionnement.
  placeEventLabels(document);
});

/* ------------------------------------------------------------ démarrage */

async function start() {
  // La scène part en même temps que la météo, pas avant : trois.js pèse
  // 170 Ko et la phrase n'a aucune raison de l'attendre.
  const sceneReady = loadScene().then((created) => {
    scene = created;
    attachScene();
  });

  crossFade(0);

  const stored = readStoredPlace();
  if (stored) {
    show(stored);
    await sceneReady;
    return;
  }

  renderState(stateEl, { detail: 'Recherche de ta position…', skeleton: true });

  const located = await locate();
  if (located) {
    selectPlace(located);
    await sceneReady;
    return;
  }

  askForPlace();
  await sceneReady;
}

start();
