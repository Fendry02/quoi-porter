import Storage from 'expo-sqlite/kv-store';

import { isTrip } from '@/core/packing';
import type { Place, Profile, Trip, WidgetData } from './types';

const PLACE_KEY = 'quoi-porter.place';
const WIDGET_KEY = 'quoi-porter.widget';
const PROFILE_KEY = 'quoi-porter.profile';
const TRIPS_KEY = 'quoi-porter.trips';

/**
 * Les clés d'avant le renommage du projet. Elles ne servent plus à écrire :
 * on les relit une fois pour ne pas faire redemander sa ville et son vestiaire
 * à quelqu'un qui se servait déjà de l'app.
 */
const LEGACY_KEYS: Record<string, string> = {
  [PLACE_KEY]: 'weather-clothes.place',
  [WIDGET_KEY]: 'weather-clothes.widget',
  [PROFILE_KEY]: 'weather-clothes.profile',
};

/**
 * Lit une clé, en retombant sur son ancien nom quand la nouvelle est vide, et
 * en rangeant aussitôt ce qui a été trouvé sous le nouveau nom. La reprise
 * n'a donc lieu qu'une fois par appareil.
 */
async function read(key: string): Promise<string | null> {
  const value = await Storage.getItem(key);
  if (value !== null) return value;

  const legacyKey = LEGACY_KEYS[key];
  if (!legacyKey) return null;

  const legacy = await Storage.getItem(legacyKey);
  if (legacy !== null) {
    await Storage.setItem(key, legacy);
    await Storage.removeItem(legacyKey);
  }

  return legacy;
}

function parse<Value>(raw: string | null): Value | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Value;
  } catch {
    return null;
  }
}

export async function getStoredPlace(): Promise<Place | null> {
  const place = parse<Place>(await read(PLACE_KEY));
  return Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude) ? place : null;
}

export function storePlace(place: Place) {
  return Storage.setItem(PLACE_KEY, JSON.stringify(place));
}

/**
 * Le vestiaire choisi. `null` tant que la question n'a pas été posée, ce qui
 * est aussi ce qui déclenche l'écran d'accueil.
 */
export async function getStoredProfile(): Promise<Profile | null> {
  const value = await read(PROFILE_KEY);
  return value === 'femme' || value === 'homme' || value === 'neutre' ? value : null;
}

export function storeProfile(profile: Profile) {
  return Storage.setItem(PROFILE_KEY, profile);
}

export async function getWidgetData(): Promise<WidgetData | null> {
  return parse<WidgetData>(await read(WIDGET_KEY));
}

export function storeWidgetData(data: WidgetData) {
  return Storage.setItem(WIDGET_KEY, JSON.stringify(data));
}

/**
 * Les voyages gardés sur l'appareil.
 *
 * Un voyage non conforme est écarté en silence : écrit par une version
 * antérieure, ou abîmé, il ne doit pas empêcher l'écran d'ouvrir. On préfère
 * perdre un voyage que l'accès à tous.
 */
export async function getStoredTrips(): Promise<Trip[]> {
  const trips = parse<Trip[]>(await read(TRIPS_KEY));
  return Array.isArray(trips) ? trips.filter((trip) => isTrip(trip)) : [];
}

export function storeTrips(trips: Trip[]) {
  return Storage.setItem(TRIPS_KEY, JSON.stringify(trips));
}
