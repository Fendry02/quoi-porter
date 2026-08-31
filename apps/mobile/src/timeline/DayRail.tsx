/**
 * Le ruban des sept jours.
 *
 * Une piste continue et une pastille qui glisse, plutôt que sept pavés dont
 * l'un change de couleur. La différence n'est pas décorative : la pastille qui
 * se déplace dit d'où l'on vient et où l'on va, là où un aplat qui saute laisse
 * chercher lequel est désormais choisi.
 *
 * Les positions sont mesurées et non calculées : les libellés n'ont pas tous la
 * même largeur — « Auj. » contre « lun 17 août » — et poser la pastille sur une
 * largeur supposée la ferait déborder un jour sur deux.
 */

import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { luminanceOf } from '@/core/weather';
import type { ForecastDay } from '@/lib/types';
import { PressableScale } from '@/motion/PressableScale';

/** Le glissement : assez amorti pour ne pas osciller sous le pouce. */
const SLIDE = { mass: 0.9, damping: 19, stiffness: 210 };

/** La teinte du texte suit la pastille, un peu plus vite qu'elle. */
const TINT_MS = 200;

/** De combien la pastille rentre dans la piste, sur les quatre côtés. */
const INSET = 3;

type Layout = { x: number; width: number };

/** Le ruban sert l'accueil comme un séjour : il ne demande que ces trois champs. */
type RailDay = Pick<ForecastDay, 'id' | 'label' | 'weather'>;

function shortDayLabel(label: string) {
  return label === 'Aujourd’hui' ? 'Auj.' : label.replace('.', '');
}

function dayTemperature(day: RailDay) {
  return `${Math.round(day.weather.feelsLikeMin)}–${Math.round(day.weather.feelsLikeMax)}°`;
}

/**
 * Le temps de chaque jour se lit dans la forme, pas dans une mosaïque de
 * données. Les symboles restent ceux de la plate-forme : SF Symbols sur iOS,
 * Material Symbols sur Android et sur le web — une même intention, jamais des
 * emoji qui changeraient selon le téléphone.
 */
function weatherSymbol(code: number): SymbolViewProps['name'] {
  if (code >= 95) {
    return { ios: 'cloud.bolt.rain.fill', android: 'thunderstorm', web: 'thunderstorm' };
  }

  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { ios: 'cloud.snow.fill', android: 'weather_snowy', web: 'weather_snowy' };
  }

  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { ios: 'cloud.rain.fill', android: 'rainy', web: 'rainy' };
  }

  if (code >= 1 && code <= 3) {
    return { ios: 'cloud.sun.fill', android: 'partly_cloudy_day', web: 'partly_cloudy_day' };
  }

  if (code === 45 || code === 48) {
    return { ios: 'cloud.fog.fill', android: 'cloud', web: 'cloud' };
  }

  return { ios: 'sun.max.fill', android: 'sunny', web: 'sunny' };
}

function DayTab({
  active,
  day,
  ink,
  muted,
  onPress,
  reduced,
}: {
  active: boolean;
  day: RailDay;
  ink: string;
  muted: string;
  onPress: () => void;
  reduced: boolean;
}) {
  const tint = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    const target = active ? 1 : 0;
    tint.value = reduced ? target : withTiming(target, { duration: TINT_MS });
  }, [active, reduced, tint]);

  // La pastille emprunte la couleur d'encre du ciel. Ce choix binaire garde
  // son contenu lisible, y compris quand un ciel de nuit fournit une encre
  // claire : elle ne peut donc jamais se transformer en case visuellement vide.
  const activeText = luminanceOf(ink) > 0.5 ? '#0B1A28' : '#F3F7FA';

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tint.value, [0, 1], [muted, activeText]),
  }));

  const tempStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tint.value, [0, 1], [ink, activeText]),
  }));

  const iconTint = active ? activeText : muted;

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      reduced={reduced}
      scaleTo={0.94}
      style={styles.tab}>
      <View style={styles.tabHeader}>
        <Animated.Text style={[styles.label, labelStyle]}>{shortDayLabel(day.label)}</Animated.Text>
        <SymbolView name={weatherSymbol(day.weather.weatherCode)} size={16} tintColor={iconTint} />
      </View>
      <Animated.Text style={[styles.temp, tempStyle]}>{dayTemperature(day)}</Animated.Text>
    </PressableScale>
  );
}

export function DayRail({
  boundaries = [],
  days,
  ink,
  muted,
  onSelect,
  reduced,
  selectedId,
  surface,
}: {
  boundaries?: string[];
  days: RailDay[];
  ink: string;
  muted: string;
  onSelect: (id: string) => void;
  reduced: boolean;
  selectedId: string;
  surface: string;
}) {
  const layouts = useRef<Record<string, Layout>>({});
  const placed = useRef(false);

  const left = useSharedValue(0);
  const width = useSharedValue(0);

  // Le premier placement se fait d'un bloc : faire glisser la pastille depuis
  // le bord gauche à l'ouverture serait une animation sur rien.
  //
  // `set()` et non `.value =` : écrire dans une valeur partagée listée en
  // dépendance d'un hook est refusé par la règle d'immutabilité du compilateur
  // React, qui ne peut pas savoir que celle-ci est faite pour être écrite.
  const place = useCallback(
    (id: string) => {
      const layout = layouts.current[id];
      if (!layout) return;

      const x = layout.x + INSET;
      const w = Math.max(0, layout.width - INSET * 2);

      if (!placed.current || reduced) {
        placed.current = true;
        left.set(x);
        width.set(w);
        return;
      }

      left.set(withSpring(x, SLIDE));
      width.set(withSpring(w, SLIDE));
    },
    [left, reduced, width],
  );

  const measure = useCallback(
    (id: string, layout: Layout) => {
      layouts.current[id] = layout;
      // Un onglet ne se mesure qu'après le premier rendu : sans ce rappel, la
      // pastille resterait large de zéro jusqu'au premier changement de jour.
      if (id === selectedId) place(id);
    },
    [place, selectedId],
  );

  useEffect(() => {
    place(selectedId);
  }, [place, selectedId]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: left.value }],
    width: width.value,
  }));

  return (
    <ScrollView
      accessibilityLabel="Les sept jours à venir"
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}>
      <Animated.View style={[styles.track, { backgroundColor: surface }]}>
        <Animated.View style={[styles.pill, { backgroundColor: ink }, pill]} />

        {days.map((day) => (
          <View key={day.id} onLayout={(event) => measure(day.id, event.nativeEvent.layout)} style={styles.tabWrapper}>
            {boundaries.includes(day.id) ? (
              <View pointerEvents="none" style={[styles.boundary, { backgroundColor: `${muted}55` }]} />
            ) : null}
            <DayTab
              active={day.id === selectedId}
              day={day}
              ink={ink}
              muted={muted}
              onPress={() => onSelect(day.id)}
              reduced={reduced}
            />
          </View>
        ))}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, paddingRight: 20 },
  track: { borderRadius: 17, flexDirection: 'row' },
  pill: { borderRadius: 14, bottom: INSET, left: 0, position: 'absolute', top: INSET },
  tabWrapper: { position: 'relative' },
  boundary: { bottom: 0, left: -4, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  tab: { minWidth: 92, paddingHorizontal: 13, paddingVertical: 11 },
  tabHeader: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '600' },
  temp: { fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: 7 },
});
