import Storage from 'expo-sqlite/kv-store';

import type { Place, WidgetData } from './types';

const PLACE_KEY = 'weather-clothes.place';
const WIDGET_KEY = 'weather-clothes.widget';

function parse<Value>(raw: string | null): Value | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Value;
  } catch {
    return null;
  }
}

export async function getStoredPlace(): Promise<Place | null> {
  const place = parse<Place>(await Storage.getItem(PLACE_KEY));
  return Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude) ? place : null;
}

export function storePlace(place: Place) {
  return Storage.setItem(PLACE_KEY, JSON.stringify(place));
}

export async function getWidgetData(): Promise<WidgetData | null> {
  return parse<WidgetData>(await Storage.getItem(WIDGET_KEY));
}

export function storeWidgetData(data: WidgetData) {
  return Storage.setItem(WIDGET_KEY, JSON.stringify(data));
}
