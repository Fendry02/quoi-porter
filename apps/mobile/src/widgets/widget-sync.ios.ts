import TodayOutfitWidget from './TodayOutfitWidget.ios';

import type { WidgetData } from '@/lib/types';

export function updateTodayWidget(data: WidgetData) {
  TodayOutfitWidget.updateSnapshot(data);
}
