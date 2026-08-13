import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { buildWeek, fetchForecast, geocode, widgetSnapshot } from '@/core/weather';
// Metro sélectionne storage.native.ts ou storage.web.ts selon la plateforme.
// eslint-disable-next-line import/no-unresolved
import { getStoredPlace, storePlace, storeWidgetData } from '@/lib/storage';
import type { ForecastDay, Place, WidgetData } from '@/lib/types';
import { updateTodayWidget } from '@/widgets/widget-sync';

type ForecastState = {
  days: ForecastDay[];
  place: Place | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: ForecastState = { days: [], place: null, loading: true, error: null };

async function locatePlace(): Promise<Place> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('La position est nécessaire pour proposer une tenue. Choisis une ville pour continuer.');
  }

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [address] = await Location.reverseGeocodeAsync(position.coords);
  const name = [address?.city, address?.region, address?.country].filter(Boolean).join(', ');

  return { name: name || 'Ma position', latitude: position.coords.latitude, longitude: position.coords.longitude };
}

export function useForecast() {
  const [state, setState] = useState<ForecastState>(INITIAL_STATE);

  const refresh = useCallback(async (nextPlace?: Place) => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const place = nextPlace ?? (await getStoredPlace()) ?? (await locatePlace());
      await storePlace(place);

      const forecast = await fetchForecast(place.latitude, place.longitude, 7);
      const days = buildWeek(forecast, new Date()) as ForecastDay[];
      const data = widgetSnapshot(days[0], place.name) as WidgetData;

      await storeWidgetData(data);
      await updateTodayWidget(data);
      setState({ days, place, loading: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'La météo est indisponible pour le moment.';
      setState((current) => ({ ...current, loading: false, error: message }));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  const selectPlace = useCallback(
    async (place: Place) => {
      await refresh(place);
    },
    [refresh],
  );

  return {
    ...state,
    refresh,
    selectPlace,
    searchPlaces: geocode as (query: string) => Promise<Place[]>,
  };
}
