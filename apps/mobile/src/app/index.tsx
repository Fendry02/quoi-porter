/*
 * THESIS: la météo devient un geste matinal, pas un tableau de données — une
 * tenue au premier regard, puis une semaine que l’on fait glisser.
 * OWN-WORLD: champs de ciel calmes, encre issue du ciel, serif uniquement
 * pour le conseil et chiffres système pour les mesures.
 * STORY: choisir sa ville, lire quoi porter, comparer les sept jours sans
 * quitter l'écran.
 * FIRST VIEWPORT: lieu en haut, tenue en grand au centre, ruban de jours sous
 * l'explication ; les alertes et mesures viennent ensuite dans le défilement.
 * FORM: un horizon météo sélectionnable, seed a17d12e0, structure 6.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
 */

import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { conditionLabel, weatherPalette } from '@/core/weather';
import { useForecast } from '@/hooks/use-forecast';
import type { ForecastDay, Place } from '@/lib/types';

function shortDayLabel(label: string) {
  return label === 'Aujourd’hui' ? 'Auj.' : label.replace('.', '');
}

function dayTemperature(day: ForecastDay) {
  return `${Math.round(day.weather.feelsLikeMin)}–${Math.round(day.weather.feelsLikeMax)}°`;
}

function Metric({ label, value, muted, ink }: { label: string; value: string; muted: string; ink: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: ink }]}>{value}</Text>
    </View>
  );
}

function PlacePicker({
  visible,
  onClose,
  onSelect,
  searchPlaces,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (place: Place) => Promise<void>;
  searchPlaces: (query: string) => Promise<Place[]>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function search() {
    const value = query.trim();
    if (!value) return;

    setStatus('Recherche…');
    setResults([]);

    try {
      const places = await searchPlaces(value);
      setResults(places);
      setStatus(places.length === 0 ? 'Aucun lieu trouvé. Essaie une autre orthographe.' : null);
    } catch {
      setStatus('La recherche a échoué. Réessaie dans un instant.');
    }
  }

  async function choose(place: Place) {
    setStatus('Prévision en cours…');
    await onSelect(place);
    setStatus(null);
    setQuery('');
    setResults([]);
    onClose();
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>
            Choisir une ville
          </Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Fermer</Text>
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Ville recherchée"
            autoCapitalize="words"
            autoFocus
            onChangeText={setQuery}
            onSubmitEditing={search}
            placeholder="Paris, Lisbonne, Oslo…"
            placeholderTextColor="#66747D"
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          <Pressable accessibilityRole="button" onPress={search} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Chercher</Text>
          </Pressable>
        </View>
        {status ? <Text style={styles.searchStatus}>{status}</Text> : null}
        <ScrollView contentContainerStyle={styles.searchResults} keyboardShouldPersistTaps="handled">
          {results.map((place) => (
            <Pressable
              accessibilityLabel={`Choisir ${place.name}`}
              accessibilityRole="button"
              key={`${place.latitude}-${place.longitude}`}
              onPress={() => choose(place)}
              style={styles.placeResult}>
              <Text style={styles.placeResultText}>{place.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function HomeScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { days, place, loading, error, refresh, selectPlace, searchPlaces } = useForecast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);

  const selected = useMemo(
    () => days.find((day) => day.id === selectedId) ?? days[0],
    [days, selectedId],
  );
  const palette = weatherPalette(selected?.weather.weatherCode ?? 2, scheme);

  if (loading && !selected) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: palette.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator color={palette.ink} size="large" />
        <Text style={[styles.loadingText, { color: palette.ink }]}>Je regarde le ciel…</Text>
      </View>
    );
  }

  if (!selected) {
    return (
      <SafeAreaView style={[styles.errorScreen, { backgroundColor: palette.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Text accessibilityRole="header" style={[styles.errorTitle, { color: palette.ink }]}>
          Où es-tu ?
        </Text>
        <Text style={[styles.errorText, { color: palette.muted }]}>
          {error ?? 'Il me faut une ville pour te proposer une tenue.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setFinderOpen(true)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Choisir une ville</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => refresh()} style={styles.textButton}>
          <Text style={[styles.textButtonText, { color: palette.ink }]}>Réessayer avec ma position</Text>
        </Pressable>
        <PlacePicker
          onClose={() => setFinderOpen(false)}
          onSelect={selectPlace}
          searchPlaces={searchPlaces}
          visible={finderOpen}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => refresh()} refreshing={loading} tintColor={palette.ink} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <Pressable
            accessibilityHint="Ouvre la recherche de ville"
            accessibilityRole="button"
            onPress={() => setFinderOpen(true)}
            style={({ pressed }) => [styles.placeButton, pressed && styles.pressed]}>
            <Text numberOfLines={1} style={[styles.placeName, { color: palette.ink }]}>
              {place?.name ?? 'Ma position'}
            </Text>
            <Text style={[styles.changePlace, { color: palette.muted }]}>Changer</Text>
          </Pressable>
          <Text style={[styles.condition, { color: palette.muted }]}>{conditionLabel(selected.weather.weatherCode)}</Text>
        </View>

        <View style={styles.hero}>
          <Text accessibilityRole="header" style={[styles.dayTitle, { color: palette.ink }]}>
            {selected.label}
          </Text>
          <Text style={[styles.outfit, { color: palette.ink }]}>{selected.phrasing.wear}</Text>
          {selected.phrasing.carry ? (
            <Text style={[styles.carry, { color: palette.ink }]}>{selected.phrasing.carry}</Text>
          ) : null}
          <Text style={[styles.weatherSentence, { color: palette.muted }]}>{selected.phrasing.weather}</Text>
        </View>

        <ScrollView
          accessibilityLabel="Les sept jours à venir"
          contentContainerStyle={styles.dayRail}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {days.map((day) => {
            const active = day.id === selected.id;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                key={day.id}
                onPress={() => setSelectedId(day.id)}
                style={({ pressed }) => [
                  styles.dayTab,
                  { backgroundColor: active ? palette.ink : palette.surface },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.dayTabLabel, { color: active ? palette.background : palette.muted }]}>
                  {shortDayLabel(day.label)}
                </Text>
                <Text style={[styles.dayTabTemp, { color: active ? palette.background : palette.ink }]}>
                  {dayTemperature(day)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.details, { backgroundColor: palette.surface }]}>
          <View style={styles.metricGrid}>
            <Metric ink={palette.ink} label="Ressenti" muted={palette.muted} value={dayTemperature(selected)} />
            <Metric ink={palette.ink} label="Pluie" muted={palette.muted} value={`${Math.round(selected.weather.precipitationProbability)} %`} />
            <Metric ink={palette.ink} label="Rafales" muted={palette.muted} value={`${Math.round(selected.weather.windGustsKmh)} km/h`} />
            <Metric ink={palette.ink} label="UV" muted={palette.muted} value={String(Math.round(selected.weather.uvIndex))} />
          </View>
        </View>

        {selected.phrasing.notes.length > 0 ? (
          <View style={styles.notes}>
            {selected.phrasing.notes.map((note) => (
              <View key={`${note.label}-${note.text}`} style={[styles.note, { borderColor: palette.muted + '40' }]}>
                <Text style={[styles.noteLabel, { color: palette.ink }]}>{note.label}</Text>
                <Text style={[styles.noteText, { color: palette.muted }]}>
                  {note.when ? `${note.when} · ` : ''}
                  {note.text}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {selected.phrasing.confidence ? (
          <Text style={[styles.confidence, { color: palette.muted }]}>{selected.phrasing.confidence}</Text>
        ) : null}
      </ScrollView>
      <PlacePicker
        onClose={() => setFinderOpen(false)}
        onSelect={selectPlace}
        searchPlaces={searchPlaces}
        visible={finderOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  loadingScreen: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  loadingText: { fontSize: 17 },
  errorScreen: { alignItems: 'flex-start', flex: 1, justifyContent: 'center', padding: 24 },
  errorTitle: { fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }), fontSize: 38, letterSpacing: -0.7 },
  errorText: { fontSize: 17, lineHeight: 25, marginTop: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: '#10242F', borderRadius: 14, marginTop: 28, minHeight: 48, paddingHorizontal: 18, paddingVertical: 13 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  textButton: { minHeight: 48, justifyContent: 'center', marginTop: 12 },
  textButtonText: { fontSize: 16, fontWeight: '600' },
  topline: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 },
  placeButton: { flex: 1, minHeight: 44, paddingRight: 12 },
  placeName: { fontSize: 17, fontWeight: '700', lineHeight: 21 },
  changePlace: { fontSize: 14, marginTop: 2 },
  condition: { fontSize: 14, lineHeight: 21, maxWidth: 130, textAlign: 'right' },
  hero: { paddingBottom: 28, paddingTop: 38 },
  dayTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, marginBottom: 12 },
  outfit: { fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }), fontSize: 37, letterSpacing: -1.1, lineHeight: 42 },
  carry: { fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }), fontSize: 21, fontStyle: 'italic', lineHeight: 27, marginTop: 10 },
  weatherSentence: { fontSize: 16, lineHeight: 23, marginTop: 18 },
  dayRail: { gap: 8, paddingBottom: 28, paddingRight: 20 },
  dayTab: { borderRadius: 14, minHeight: 70, minWidth: 78, paddingHorizontal: 12, paddingVertical: 11 },
  dayTabLabel: { fontSize: 13, fontWeight: '600' },
  dayTabTemp: { fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: 6 },
  details: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { minHeight: 72, justifyContent: 'center', width: '50%' },
  metricLabel: { fontSize: 13, fontWeight: '600' },
  metricValue: { fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: 4 },
  notes: { marginTop: 30 },
  note: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  noteLabel: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  noteText: { fontSize: 15, lineHeight: 21 },
  confidence: { fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 20 },
  pressed: { opacity: 0.72 },
  sheet: { backgroundColor: '#F7FAFB', flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  sheetTitle: { color: '#10242F', fontSize: 22, fontWeight: '700' },
  closeButton: { justifyContent: 'center', minHeight: 44 },
  closeText: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 22 },
  searchInput: { backgroundColor: '#FFFFFF', borderColor: '#C3D0D5', borderRadius: 12, borderWidth: 1, color: '#10242F', flex: 1, fontSize: 16, minHeight: 48, paddingHorizontal: 13 },
  searchButton: { alignItems: 'center', backgroundColor: '#10242F', borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
  searchButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  searchStatus: { color: '#425A66', fontSize: 15, lineHeight: 22, marginTop: 16 },
  searchResults: { paddingTop: 12 },
  placeResult: { borderBottomColor: '#C3D0D5', borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 56 },
  placeResultText: { color: '#10242F', fontSize: 16 },
});
