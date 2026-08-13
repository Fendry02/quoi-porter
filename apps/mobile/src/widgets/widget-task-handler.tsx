import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { buildWeek, fetchForecast, widgetSnapshot } from '@/core/weather';
// Metro sélectionne storage.native.ts ou storage.web.ts selon la plateforme.
// eslint-disable-next-line import/no-unresolved
import { getStoredPlace, getWidgetData, storeWidgetData } from '@/lib/storage';
import type { ForecastDay, WidgetData } from '@/lib/types';

import { TodayOutfitWidget } from './TodayOutfitWidget.android';

const EMPTY_WIDGET: WidgetData = {
  place: 'Tenue du jour',
  outfit: 'Ouvre l’app pour choisir ta tenue.',
  temperature: '—',
  attention: null,
};

async function freshWidgetData() {
  const place = await getStoredPlace();
  if (!place) return (await getWidgetData()) ?? EMPTY_WIDGET;

  try {
    const days = buildWeek(await fetchForecast(place.latitude, place.longitude, 7)) as ForecastDay[];
    const data = widgetSnapshot(days[0], place.name) as WidgetData;
    await storeWidgetData(data);
    return data;
  } catch {
    return (await getWidgetData()) ?? EMPTY_WIDGET;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== 'TodayOutfit' || props.widgetAction === 'WIDGET_DELETED') return;

  const data = await freshWidgetData();
  props.renderWidget(<TodayOutfitWidget data={data} />);
}
