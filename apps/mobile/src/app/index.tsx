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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { weatherPalette } from '@/core/weather';
import { useForecast } from '@/hooks/use-forecast';
import { useProfile } from '@/hooks/use-profile';
import { useNow } from '@/hooks/use-now';
import type { ForecastDay, Place } from '@/lib/types';
import { SkyBackground } from '@/sky/SkyBackground';
import { useSkyMood } from '@/sky/use-sky-mood';
import { WardrobeQuestion, wardrobeLabel } from '@/profile/WardrobeQuestion';
import { DayTimeline } from '@/timeline/DayTimeline';

function shortDayLabel(label: string) {
  return label === 'Aujourd’hui' ? 'Auj.' : label.replace('.', '');
}

function dayTemperature(day: ForecastDay) {
  return `${Math.round(day.weather.feelsLikeMin)}–${Math.round(day.weather.feelsLikeMax)}°`;
}

/** Les pièces portées, dans l'ordre où on les enfile. */
function garmentsOf(day: ForecastDay) {
  const { top, bottom, outer, feet } = day.outfit.layers;
  return [...top, bottom, outer, feet].filter(Boolean) as string[];
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * De quoi garder le texte lisible sur un ciel vivant.
 *
 * L'encre vient déjà de `js/sky.js` et suit l'ambiance, mais elle a été pensée
 * pour un dégradé calme : un ciel de midi très clair, ou une nuit d'orage
 * traversée d'éclairs, demandent un voile en plus. Sombre sous une encre
 * claire, clair sous une encre sombre.
 */
function veilsFor(ink: string) {
  const n = parseInt(ink.replace('#', ''), 16);
  const luminance =
    (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  const inkIsLight = luminance > 0.5;

  return {
    scrim: inkIsLight ? 'rgba(6,10,20,0.30)' : 'rgba(255,255,255,0.24)',
    surface: inkIsLight ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.46)',
  };
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
  const { profile, loading: profileLoading, choose } = useProfile();
  const { days, place, loading, error, refresh, selectPlace, searchPlaces } = useForecast(profile);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);

  const { width, height } = useWindowDimensions();

  const selected = useMemo(
    () => days.find((day) => day.id === selectedId) ?? days[0],
    [days, selectedId],
  );
  const palette = weatherPalette(selected?.weather.weatherCode ?? 2, scheme);

  const at = useNow();
  const sky = useSkyMood(selected?.weather, at);

  const ink = sky.ink;
  const muted = `${ink}B0`;
  const veils = useMemo(() => veilsFor(ink), [ink]);

  // Rien tant qu'on lit le disque : afficher la question puis la retirer
  // aussitôt la ferait clignoter à chaque ouverture.
  if (profileLoading) {
    return <View style={[styles.loadingScreen, { backgroundColor: palette.background }]} />;
  }

  if (profile === null) {
    return <WardrobeQuestion onChoose={choose} />;
  }

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

  // L'écran moins ses marges (20 de chaque côté), moins celles de la carte (16).
  const chartWidth = width - 72;

  return (
    <View style={styles.root}>
      <SkyBackground height={height} state={sky} width={width} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veils.scrim }]} />

      <SafeAreaView style={styles.screen}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl onRefresh={() => refresh()} refreshing={loading} tintColor={ink} />}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topline}>
            <Pressable
              accessibilityHint="Ouvre la recherche de ville"
              accessibilityRole="button"
              onPress={() => setFinderOpen(true)}
              style={({ pressed }) => [styles.placeButton, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={[styles.placeName, { color: ink }]}>
                {place?.name ?? 'Ma position'}
              </Text>
              <Text style={[styles.changePlace, { color: muted }]}>Changer</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Change le vestiaire dans lequel les tenues sont choisies"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setWardrobeOpen(true)}
              style={({ pressed }) => [styles.wardrobeButton, pressed && styles.pressed]}>
              <Text style={[styles.wardrobeLabel, { color: muted }]}>{wardrobeLabel(profile)}</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.dayLine}>
              <Text accessibilityRole="header" style={[styles.dayTitle, { color: ink }]}>
                {selected.label}
              </Text>
              {selected.phrasing.versusYesterday ? (
                <Text style={[styles.versus, { color: muted }]}>
                  {selected.phrasing.versusYesterday}
                </Text>
              ) : null}
            </View>

            {/* Un vêtement par ligne, dans l'ordre où on s'habille : l'œil
                saisit un empilement, il lit une liste à virgules. La phrase
                entière reste la seule chose que VoiceOver énonce — la découpe
                est visuelle, pas sémantique. */}
            <View
              accessible
              accessibilityLabel={selected.phrasing.wear}
              style={styles.garments}>
              {garmentsOf(selected).map((piece) => (
                <Text key={piece} style={[styles.garment, { color: ink }]}>
                  {capitalize(piece)}
                </Text>
              ))}
            </View>

            {selected.phrasing.carry ? (
              <Text style={[styles.carry, { color: ink }]}>{selected.phrasing.carry}</Text>
            ) : null}

            {/* Ce que la tenue du jour ne couvre pas : la seule ligne sur
                laquelle on peut encore agir en partant. */}
            {selected.phrasing.later ? (
              <Text style={[styles.later, { color: ink, borderColor: `${ink}30` }]}>
                {selected.phrasing.later}
              </Text>
            ) : null}

            <Text style={[styles.weatherSentence, { color: muted }]}>{selected.phrasing.weather}</Text>
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
                    { backgroundColor: active ? ink : veils.surface },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.dayTabLabel, { color: active ? sky.horizon : muted }]}>
                    {shortDayLabel(day.label)}
                  </Text>
                  <Text style={[styles.dayTabTemp, { color: active ? sky.horizon : ink }]}>
                    {dayTemperature(day)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Le déroulé avant les mesures : savoir quand tombe l'averse compte
              plus que son cumul de la journée. */}
          <View style={[styles.details, { backgroundColor: veils.surface }]}>
            <DayTimeline at={at} ink={ink} weather={selected.weather} width={chartWidth} />
          </View>

          {/* La grille Ressenti / Pluie / Rafales / UV a été retirée : la courbe
              porte déjà la température et la pluie, et les alertes portent le
              reste quand il compte. Le produit répond à une question, il ne
              tient pas un tableau de bord. */}

          {selected.phrasing.notes.length > 0 ? (
            <View style={styles.notes}>
              {selected.phrasing.notes.map((note) => (
                <View key={`${note.label}-${note.text}`} style={[styles.note, { borderColor: muted + '40' }]}>
                  <Text style={[styles.noteLabel, { color: ink }]}>{note.label}</Text>
                  <Text style={[styles.noteText, { color: muted }]}>
                    {note.when ? `${note.when} · ` : ''}
                    {note.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {selected.phrasing.confidence ? (
            <Text style={[styles.confidence, { color: muted }]}>{selected.phrasing.confidence}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <PlacePicker
        onClose={() => setFinderOpen(false)}
        onSelect={selectPlace}
        searchPlaces={searchPlaces}
        visible={finderOpen}
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setWardrobeOpen(false)}
        presentationStyle="pageSheet"
        visible={wardrobeOpen}>
        <WardrobeQuestion
          current={profile}
          onChoose={(next) => {
            void choose(next);
            setWardrobeOpen(false);
          }}
          onClose={() => setWardrobeOpen(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Transparent : c'est le ciel qui est derrière, pas un aplat.
  screen: { backgroundColor: 'transparent', flex: 1 },
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
  wardrobeButton: { justifyContent: 'center', minHeight: 44, paddingLeft: 12 },
  wardrobeLabel: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  hero: { paddingBottom: 28, paddingTop: 38 },
  dayLine: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  dayTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  versus: { fontSize: 15, lineHeight: 21 },
  garments: { gap: 2 },
  // Un cran sous l'ancienne phrase : quatre lignes prennent plus de hauteur
  // qu'un paragraphe, et le premier écran doit tenir la tenue entière.
  garment: {
    fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }),
    fontSize: 31,
    letterSpacing: -0.9,
    lineHeight: 38,
  },
  carry: { fontFamily: Platform.select({ ios: 'ui-serif', default: 'serif' }), fontSize: 21, fontStyle: 'italic', lineHeight: 27, marginTop: 14 },
  later: {
    borderLeftWidth: 2,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: 18,
    paddingLeft: 12,
  },
  weatherSentence: { fontSize: 16, lineHeight: 23, marginTop: 18 },
  dayRail: { gap: 8, paddingBottom: 28, paddingRight: 20 },
  dayTab: { borderRadius: 14, minHeight: 70, minWidth: 78, paddingHorizontal: 12, paddingVertical: 11 },
  dayTabLabel: { fontSize: 13, fontWeight: '600' },
  dayTabTemp: { fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: 6 },
  details: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6 },
  stacked: { marginTop: 12 },
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
