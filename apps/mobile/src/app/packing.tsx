/*
 * THESIS: une valise est une réponse, pas une checklist — la liste d'abord,
 * les journées ensuite, comme la tenue passe avant la météo sur l'accueil.
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { geocode, luminanceOf, veilFor } from '@/core/weather';
import { useNow } from '@/hooks/use-now';
import { useProfile } from '@/hooks/use-profile';
import { useTrip } from '@/hooks/use-trip';
import type { Place } from '@/lib/types';
import { PressableScale } from '@/motion/PressableScale';
import { Reveal } from '@/motion/Reveal';
import { useMotion } from '@/motion/use-motion';
import { TripEditor } from '@/packing/TripEditor';
import { TripLibrary } from '@/packing/TripLibrary';
import { PlacePicker } from '@/places/PlacePicker';
import { SkyBackground } from '@/sky/SkyBackground';
import { useSkyMood } from '@/sky/use-sky-mood';
import { DayRail } from '@/timeline/DayRail';

export default function PackingScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { profile } = useProfile();
  const { trips, trip, packing, words, loading, error, remove, refresh, save, select, toggle } = useTrip(profile);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finder, setFinder] = useState<((place: Place | null) => void) | null>(null);

  const { width, height } = useWindowDimensions();
  const at = useNow();
  const motion = useMotion();
  const reduced = motion.reduced;

  const openPlaceFinder = useCallback(
    () =>
      new Promise<Place | null>((resolve) => {
        setFinder(() => resolve);
      }),
    [],
  );

  function resolvePlace(place: Place | null) {
    finder?.(place);
    setFinder(null);
  }

  // Au retour, le séjour se revalide. Le premier passage est déjà chargé par
  // le hook, et le refaire doublerait la requête.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }

      void refresh();
    }, [refresh]),
  );

  const selected = packing?.days.find((day) => day.id === selectedId) ?? packing?.days[0];
  const sky = useSkyMood(selected?.weather, at, motion);
  const ink = sky.ink;
  const muted = `${ink}B0`;
  const veil = veilFor(ink, [sky.zenith, sky.horizon]);
  const scrim = `${veil.color}${Math.round(veil.alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
  const surface = luminanceOf(ink) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.46)';
  const boundaries = (packing?.days ?? [])
    .filter((day, index, days) => index > 0 && day.place.name !== days[index - 1].place.name)
    .map((day) => day.id);
  const packedKeys = new Set(
    [...(packing?.wear ?? []), ...(packing?.carry ?? [])]
      .filter((item) => item.packed)
      .map((item) => item.key),
  );

  if (!trip || editing || creating) {
    return (
      <SafeAreaView style={styles.editor}>
        <StatusBar style="dark" />
        <TripEditor
          initial={creating ? null : trip}
          onCancel={() => {
            setCreating(false);
            setEditing(false);
          }}
          onDone={async (next) => {
            await save(next);
            setCreating(false);
            setEditing(false);
          }}
          openPlaceFinder={openPlaceFinder}
          reduced={reduced}
        />
        <PlacePicker
          onClose={() => resolvePlace(null)}
          onSelect={async (place) => resolvePlace(place)}
          reduced={reduced}
          searchPlaces={geocode}
          visible={finder !== null}
        />
      </SafeAreaView>
    );
  }

  if (loading && !packing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Je regarde le ciel de là-bas…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SkyBackground height={height} state={sky} width={width} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} />

      <SafeAreaView style={styles.screen}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={loading} tintColor={ink} />}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topline}>
            <PressableScale
              accessibilityHint="Change les dates ou les villes du séjour"
              accessibilityRole="button"
              onPress={() => setEditing(true)}
              reduced={reduced}
              style={styles.titleButton}>
              <Text numberOfLines={2} style={styles.title}>
                <Text style={{ color: ink }}>{words?.title}</Text>
                <Text style={{ color: muted }}> · {words?.dates}</Text>
              </Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Mes voyages"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setLibraryOpen(true)}
              reduced={reduced}
              scaleTo={0.9}
              style={[styles.moreButton, { backgroundColor: surface }]}>
              <View style={[styles.dot, { backgroundColor: ink }]} />
              <View style={[styles.dot, { backgroundColor: ink }]} />
              <View style={[styles.dot, { backgroundColor: ink }]} />
            </PressableScale>
          </View>

          {error ? (
            <View>
              <Text style={[styles.error, { color: ink }]}>{error}</Text>
              <PressableScale accessibilityRole="button" onPress={() => void refresh()} reduced={reduced} style={styles.retry}>
                <Text style={[styles.retryText, { color: ink }]}>Réessayer</Text>
              </PressableScale>
            </View>
          ) : null}

          {packing?.progress && packing.progress.total > 0 ? (
            <Text style={[styles.progress, { color: muted }]}>
              {packing.progress.done} sur {packing.progress.total} dans le sac.
            </Text>
          ) : null}

          <View style={styles.list}>
            {words?.wear.map((item, index) => {
              const packed = packedKeys.has(item.key);

              return (
                <Reveal index={index} key={item.key} reduced={reduced}>
                  <PressableScale
                    accessibilityLabel={`${item.label}, ${packed ? 'dans le sac' : 'à mettre dans le sac'}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: packed }}
                    onPress={() => void toggle(item.key)}
                    reduced={reduced}
                    scaleTo={0.985}
                    style={styles.item}>
                    <Text style={[styles.itemLabel, { color: ink }, packed ? styles.done : null]}>{item.label}</Text>
                    {item.detail ? <Text style={[styles.itemDetail, { color: muted }]}>{item.detail}</Text> : null}
                    <Text style={[styles.itemWhy, { color: muted }]}>{item.why}</Text>
                  </PressableScale>
                </Reveal>
              );
            })}
          </View>

          {words && words.carry.length > 0 ? (
            <View style={styles.list}>
              <Text style={[styles.sectionTitle, { color: muted }]}>Et tu emportes</Text>
              {words.carry.map((item) => {
                const packed = packedKeys.has(item.key);

                return (
                  <PressableScale
                    accessibilityLabel={`${item.label}, ${packed ? 'dans le sac' : 'à mettre dans le sac'}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: packed }}
                    key={item.key}
                    onPress={() => void toggle(item.key)}
                    reduced={reduced}
                    scaleTo={0.985}
                    style={styles.item}>
                    <Text style={[styles.itemLabel, { color: ink }, packed ? styles.done : null]}>{item.label}</Text>
                    <Text style={[styles.itemWhy, { color: muted }]}>{item.why}</Text>
                  </PressableScale>
                );
              })}
            </View>
          ) : null}

          {packing ? (
            <DayRail
              boundaries={boundaries}
              days={packing.days}
              ink={ink}
              muted={muted}
              onSelect={setSelectedId}
              reduced={reduced}
              selectedId={selected?.id ?? ''}
              surface={surface}
            />
          ) : null}

          {selected ? (
            <View style={[styles.day, { backgroundColor: surface }]}>
              <Text style={[styles.dayPlace, { color: muted }]}>{selected.place.name.split(',')[0]}</Text>
              <Text style={[styles.dayWear, { color: ink }]}>{selected.phrasing.wear}</Text>
              <Text style={[styles.dayWeather, { color: muted }]}>{selected.phrasing.weather}</Text>
              {selected.phrasing.confidence ? (
                <Text style={[styles.dayWeather, { color: muted }]}>{selected.phrasing.confidence}</Text>
              ) : null}
            </View>
          ) : null}

          {words?.notes.map((note) => (
            <View key={note.label} style={[styles.note, { borderColor: `${muted}40` }]}>
              <Text style={[styles.noteLabel, { color: ink }]}>{note.label}</Text>
              <Text style={[styles.noteText, { color: muted }]}>
                {note.when ? `${note.when} · ` : ''}
                {note.text}
              </Text>
            </View>
          ))}

          {words?.confidence ? <Text style={[styles.aside, { color: muted }]}>{words.confidence}</Text> : null}
          {words?.horizon ? <Text style={[styles.aside, { color: muted }]}>{words.horizon}</Text> : null}
        </ScrollView>
      </SafeAreaView>

      <Modal
        animationType="slide"
        onRequestClose={() => setLibraryOpen(false)}
        presentationStyle="pageSheet"
        visible={libraryOpen}>
        <TripLibrary
          currentId={trip.id}
          onClose={() => setLibraryOpen(false)}
          onCreate={() => {
            setLibraryOpen(false);
            setCreating(true);
          }}
          onRemove={(id) => void remove(id)}
          onSelect={(id) => {
            select(id);
            setLibraryOpen(false);
          }}
          reduced={reduced}
          trips={trips}
        />
      </Modal>

      <PlacePicker
        onClose={() => resolvePlace(null)}
        onSelect={async (place) => resolvePlace(place)}
        reduced={reduced}
        searchPlaces={geocode}
        visible={finder !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { backgroundColor: 'transparent', flex: 1 },
  content: { paddingBottom: 48, paddingHorizontal: 20 },
  loading: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  loadingText: { fontSize: 17 },
  topline: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingTop: 12 },
  titleButton: { flex: 1, justifyContent: 'center', minHeight: 44 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 29 },
  moreButton: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 3, height: 36, justifyContent: 'center', marginTop: 4, width: 36 },
  dot: { borderRadius: 2, height: 4, width: 4 },
  note: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  noteLabel: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  noteText: { fontSize: 15, lineHeight: 21 },
  aside: { fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 20 },
  progress: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  list: { marginTop: 22 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' },
  item: { paddingVertical: 10 },
  itemLabel: {
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 26,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  itemDetail: { fontSize: 15, fontStyle: 'italic', lineHeight: 21, marginTop: 2 },
  itemWhy: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  done: { opacity: 0.45, textDecorationLine: 'line-through' },
  day: { borderRadius: 16, marginTop: 18, padding: 16 },
  dayPlace: { fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  dayWear: { fontSize: 19, lineHeight: 26, marginTop: 6 },
  dayWeather: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  editor: { backgroundColor: '#F7FAFB', flex: 1 },
  error: { fontSize: 15, lineHeight: 21, marginTop: 10 },
  retry: { justifyContent: 'center', minHeight: 44 },
  retryText: { fontSize: 16, fontWeight: '600' },
});
