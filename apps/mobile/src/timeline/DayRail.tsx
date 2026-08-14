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
import { ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { ForecastDay } from '@/lib/types';
import { PressableScale } from '@/motion/PressableScale';

/** Le glissement : assez amorti pour ne pas osciller sous le pouce. */
const SLIDE = { mass: 0.9, damping: 19, stiffness: 210 };

/** La teinte du texte suit la pastille, un peu plus vite qu'elle. */
const TINT_MS = 200;

/** De combien la pastille rentre dans la piste, sur les quatre côtés. */
const INSET = 3;

type Layout = { x: number; width: number };

function shortDayLabel(label: string) {
  return label === 'Aujourd’hui' ? 'Auj.' : label.replace('.', '');
}

function dayTemperature(day: ForecastDay) {
  return `${Math.round(day.weather.feelsLikeMin)}–${Math.round(day.weather.feelsLikeMax)}°`;
}

function DayTab({
  active,
  day,
  horizon,
  ink,
  muted,
  onMeasure,
  onPress,
  reduced,
}: {
  active: boolean;
  day: ForecastDay;
  horizon: string;
  ink: string;
  muted: string;
  onMeasure: (id: string, layout: Layout) => void;
  onPress: () => void;
  reduced: boolean;
}) {
  const tint = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    const target = active ? 1 : 0;
    tint.value = reduced ? target : withTiming(target, { duration: TINT_MS });
  }, [active, reduced, tint]);

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tint.value, [0, 1], [muted, horizon]),
  }));

  const tempStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tint.value, [0, 1], [ink, horizon]),
  }));

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, x } = event.nativeEvent.layout;
      onMeasure(day.id, { width, x });
    },
    [day.id, onMeasure],
  );

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onLayout={measure}
      onPress={onPress}
      reduced={reduced}
      scaleTo={0.94}
      style={styles.tab}>
      <Animated.Text style={[styles.label, labelStyle]}>{shortDayLabel(day.label)}</Animated.Text>
      <Animated.Text style={[styles.temp, tempStyle]}>{dayTemperature(day)}</Animated.Text>
    </PressableScale>
  );
}

export function DayRail({
  days,
  horizon,
  ink,
  muted,
  onSelect,
  reduced,
  selectedId,
  surface,
}: {
  days: ForecastDay[];
  horizon: string;
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
          <DayTab
            active={day.id === selectedId}
            day={day}
            horizon={horizon}
            ink={ink}
            key={day.id}
            muted={muted}
            onMeasure={measure}
            onPress={() => onSelect(day.id)}
            reduced={reduced}
          />
        ))}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, paddingRight: 20 },
  track: { borderRadius: 17, flexDirection: 'row' },
  pill: { borderRadius: 14, bottom: INSET, left: 0, position: 'absolute', top: INSET },
  tab: { minWidth: 78, paddingHorizontal: 13, paddingVertical: 13 },
  label: { fontSize: 13, fontWeight: '600' },
  temp: { fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: 6 },
});
