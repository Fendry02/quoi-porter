import type { Place, Profile, WidgetData } from './types';

const PLACE_KEY = 'weather-clothes.place';
const WIDGET_KEY = 'weather-clothes.widget';
const PROFILE_KEY = 'weather-clothes.profile';

function getStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
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
  const place = parse<Place>(getStorage()?.getItem(PLACE_KEY) ?? null);
  return Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude) ? place : null;
}

export async function storePlace(place: Place) {
  getStorage()?.setItem(PLACE_KEY, JSON.stringify(place));
}

/**
 * Le vestiaire choisi. `null` tant que la question n'a pas été posée, ce qui
 * est aussi ce qui déclenche l'écran d'accueil.
 */
export async function getStoredProfile(): Promise<Profile | null> {
  const value = getStorage()?.getItem(PROFILE_KEY) ?? null;
  return value === 'femme' || value === 'homme' || value === 'neutre' ? value : null;
}

export async function storeProfile(profile: Profile) {
  getStorage()?.setItem(PROFILE_KEY, profile);
}

export async function getWidgetData(): Promise<WidgetData | null> {
  return parse<WidgetData>(getStorage()?.getItem(WIDGET_KEY) ?? null);
}

export async function storeWidgetData(data: WidgetData) {
  getStorage()?.setItem(WIDGET_KEY, JSON.stringify(data));
}
