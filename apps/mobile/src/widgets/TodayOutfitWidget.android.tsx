'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetData } from '@/lib/types';

export function TodayOutfitWidget({ data }: { data: WidgetData }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        flexGap: 5,
        padding: 16,
        backgroundColor: '#EFF6F8',
        borderRadius: 18,
      }}
      accessibilityLabel={`Tenue du jour à ${data.place}`}>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <TextWidget
          text={data.place || 'Ma position'}
          maxLines={1}
          style={{ color: '#425A66', fontSize: 13, fontWeight: '600' }}
        />
        <TextWidget text={data.temperature || '—'} style={{ color: '#425A66', fontSize: 13 }} />
      </FlexWidget>
      <TextWidget
        text={data.outfit || 'Ouvre l’app pour choisir ta tenue.'}
        maxLines={2}
        style={{ color: '#10242F', fontSize: 18, fontWeight: '600' }}
      />
      {data.attention ? (
        <TextWidget text={data.attention} maxLines={1} style={{ color: '#425A66', fontSize: 13 }} />
      ) : null}
    </FlexWidget>
  );
}
