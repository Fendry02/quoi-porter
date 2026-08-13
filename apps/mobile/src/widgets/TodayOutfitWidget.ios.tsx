import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetData } from '@/lib/types';

const TodayOutfitWidget = (props: WidgetData, environment: WidgetEnvironment) => {
  'widget';

  const background = environment.colorScheme === 'dark' ? '#102B38' : '#EFF6F8';
  const ink = environment.colorScheme === 'dark' ? '#F3F7FA' : '#10242F';
  const muted = environment.colorScheme === 'dark' ? '#B7CAD3' : '#425A66';

  return (
    <VStack
      alignment="leading"
      spacing={7}
      modifiers={[
        padding({ all: 16 }),
        containerBackground(background, 'widget'),
        widgetURL('weather-clothes://today'),
      ]}>
      <HStack alignment="firstTextBaseline">
        <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), foregroundStyle(muted)]}>
          {props.place || 'Ma position'}
        </Text>
        <Spacer />
        <Text modifiers={[font({ textStyle: 'caption', design: 'monospaced' }), foregroundStyle(muted)]}>
          {props.temperature || '—'}
        </Text>
      </HStack>
      <Text modifiers={[font({ textStyle: 'headline', weight: 'semibold' }), foregroundStyle(ink)]}>
        {props.outfit || 'Ouvre l’app pour choisir ta tenue.'}
      </Text>
      {props.attention ? (
        <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(muted)]}>{props.attention}</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget<WidgetData>('TodayOutfit', TodayOutfitWidget);
