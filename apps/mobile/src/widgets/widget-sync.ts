import { Platform } from 'react-native';

import type { WidgetData } from '@/lib/types';

export async function updateTodayWidget(data: WidgetData) {
  if (Platform.OS === 'ios') {
    const widget = await import('./widget-sync.ios');
    widget.updateTodayWidget(data);
    return;
  }

  if (Platform.OS === 'android') {
    const widget = await import('./widget-sync.android');
    await widget.updateTodayWidget(data);
  }
}
