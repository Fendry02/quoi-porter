import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { TodayOutfitWidget } from './TodayOutfitWidget.android';

import type { WidgetData } from '@/lib/types';

export function updateTodayWidget(data: WidgetData) {
  return requestWidgetUpdate({
    widgetName: 'TodayOutfit',
    renderWidget: () => <TodayOutfitWidget data={data} />,
  });
}
