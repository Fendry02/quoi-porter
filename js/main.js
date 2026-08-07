/**
 * Orchestration : résoudre le lieu, aller chercher la météo, décider la tenue,
 * la mettre en mots, l'afficher.
 */

import { fetchForecast, geocode, WeatherError } from './weather.js';
import { buildOutfit } from './rules.js';
import { describeDay } from './phrasing.js';
import { renderDays, renderLoading, renderState, renderPlaceResults } from './render.js';

const STORAGE_KEY = 'weather-clothes.place';

const daysEl = document.getElementById('days');
const placeToggle = document.getElementById('place-toggle');
const placeName = document.getElementById('place-name');
const placePanel = document.getElementById('place-panel');
const placeForm = document.getElementById('place-form');
const placeInput = document.getElementById('place-input');
const placeStatus = document.getElementById('place-status');
const placeResults = document.getElementById('place-results');

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
        resolve({
          name: 'Ma position',
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 15 * 60 * 1000 },
    );
  });
}

/* --------------------------------------------------------------- affichage */

async function show(place) {
  placeName.textContent = place.name;
  renderLoading(daysEl, place.name);

  try {
    const forecast = await fetchForecast(place.latitude, place.longitude);

    renderDays(
      daysEl,
      forecast.map((weather) => {
        const outfit = buildOutfit(weather);
        return { weather, outfit, phrasing: describeDay(weather, outfit) };
      }),
    );
  } catch (error) {
    renderState(daysEl, {
      message: 'Impossible de récupérer la météo.',
      detail:
        error instanceof WeatherError
          ? error.message
          : 'Une erreur inattendue est survenue pendant la récupération.',
      action: { label: 'Réessayer', onClick: () => show(place) },
    });
  }
}

function selectPlace(place) {
  storePlace(place);
  closeFinder();
  show(place);
}

/** Aucun lieu connu : on invite à en choisir un, sans traiter ça comme une panne. */
function askForPlace() {
  renderState(daysEl, {
    message: 'D’abord, où es-tu ?',
    detail:
      'La géolocalisation n’est pas disponible ou a été refusée. Cherche ta ville pour commencer.',
    action: { label: 'Chercher une ville', onClick: () => openFinder() },
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

/* ------------------------------------------------------------ démarrage */

async function start() {
  const stored = readStoredPlace();
  if (stored) {
    show(stored);
    return;
  }

  renderLoading(daysEl);

  const located = await locate();
  if (located) {
    selectPlace(located);
    return;
  }

  askForPlace();
}

start();
