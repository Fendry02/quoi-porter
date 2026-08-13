import type { Place, WidgetData } from './types';

const PLACE_KEY = 'weather-clothes.place';
const WIDGET_KEY = 'weather-clothes.widget';

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

export async function getWidgetData(): Promise<WidgetData | null> {
  return parse<WidgetData>(getStorage()?.getItem(WIDGET_KEY) ?? null);
}

export async function storeWidgetData(data: WidgetData) {
  getStorage()?.setItem(WIDGET_KEY, JSON.stringify(data));
}
