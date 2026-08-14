/*
 * THESIS: la météo devient un geste matinal, pas un tableau de données — une
 * tenue au premier regard, puis une semaine que l’on fait glisser.
 * OWN-WORLD: champs de ciel calmes, encre issue du ciel, serif uniquement
 * pour le conseil et chiffres système pour les mesures.
 * STORY: choisir sa ville, lire quoi porter, comparer les sept jours sans
 * quitter l'écran.
 * FIRST VIEWPORT: le lieu et le jour en titre pleine largeur, la tenue en grand
 * juste dessous, le ruban des jours sous l'explication ; les alertes et mesures
 * viennent ensuite dans le défilement.
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { luminanceOf, veilFor, weatherPalette } from '@/core/weather';
import { useForecast } from '@/hooks/use-forecast';
import { useProfile } from '@/hooks/use-profile';
import { useNow } from '@/hooks/use-now';
import type { ForecastDay, Place } from '@/lib/types';
import { Odometer } from '@/motion/Odometer';
import { PressableScale } from '@/motion/PressableScale';
import { Reveal } from '@/motion/Reveal';
import { useMotion } from '@/motion/use-motion';
import { SkyBackground } from '@/sky/SkyBackground';
import { useSkyMood } from '@/sky/use-sky-mood';
import { WardrobeQuestion, wardrobeLabel, wardrobeSentence } from '@/profile/WardrobeQuestion';
import { DayRail } from '@/timeline/DayRail';
import { DayTimeline } from '@/timeline/DayTimeline';

/** Ce qu'on peut tirer au-delà du haut avant que le jour soit tout à fait levé. */
const PULL = 120;

/** Interligne de la phrase météo, partagé avec le compteur qui s'y insère. */
const SENTENCE_LINE = 23;

/** Les pièces portées, dans l'ordre où on les enfile. */
function garmentsOf(day: ForecastDay) {
  const { top, bottom, outer, feet } = day.outfit.layers;
  return [...top, bottom, outer, feet].filter(Boolean) as string[];
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** La ville seule : la région et le pays ne font que tronquer le titre. */
function cityOf(place: Place | null | undefined) {
  return place?.name?.split(',')[0]?.trim() || 'Ma position';
}

/**
 * Ce que le titre ne dit pas : la région et le pays.
 *
 * Ils servent une seule fois, à savoir qu'on regarde le bon Paris. On les garde
 * donc pour la ligne du dessous, et seulement les jours où elle est libre.
 */
function regionOf(place: Place | null | undefined) {
  const reste = place?.name?.split(',').slice(1).join(', ').trim();
  return reste || null;
}

/**
 * De quoi garder le texte lisible sur un ciel vivant.
 *
 * L'encre vient déjà de `js/sky.js` et suit l'ambiance, mais elle a été pensée
 * pour un dégradé calme : un ciel de midi très clair, ou une nuit d'orage
 * traversée d'éclairs, demandent un voile en plus. Sombre sous une encre
 * claire, clair sous une encre sombre.
 */
function veilsFor(ink: string, skies: string[]) {
  // L'opacité n'est plus réglée à l'œil : `veilFor()` cherche la plus petite qui
  // tienne 4,5 pour 1 sur le zénith comme sur l'horizon. Les nuits et la plupart
  // des jours n'en réclament aucune et gardent leur éclat ; les crépuscules, qui
  // tombaient à 2 pour 1, en reçoivent un tiers.
  const veil = veilFor(ink, skies);
  const alpha = Math.round(veil.alpha * 255)
    .toString(16)
    .padStart(2, '0');

  return {
    scrim: `${veil.color}${alpha}`,
    surface: luminanceOf(ink) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.46)',
  };
}

function PlacePicker({
  visible,
  onClose,
  onSelect,
  reduced,
  searchPlaces,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (place: Place) => Promise<void>;
  reduced: boolean;
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
          <PressableScale
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            reduced={reduced}
            style={styles.closeButton}>
            <Text style={styles.closeText}>Fermer</Text>
          </PressableScale>
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
          <PressableScale
            accessibilityRole="button"
            onPress={search}
            reduced={reduced}
            style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Chercher</Text>
          </PressableScale>
        </View>
        {status ? <Text style={styles.searchStatus}>{status}</Text> : null}
        <ScrollView contentContainerStyle={styles.searchResults} keyboardShouldPersistTaps="handled">
          {results.map((place, rang) => (
            <Reveal index={rang} key={`${place.latitude}-${place.longitude}`} reduced={reduced}>
              <PressableScale
                accessibilityLabel={`Choisir ${place.name}`}
                accessibilityRole="button"
                onPress={() => choose(place)}
                reduced={reduced}
                style={styles.placeResult}>
                <Text style={styles.placeResultText}>{place.name}</Text>
              </PressableScale>
            </Reveal>
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
  const motion = useMotion();
  const reduced = motion.reduced;
  const sky = useSkyMood(selected?.weather, at, motion);

  const ink = sky.ink;
  const muted = `${ink}B0`;
  const veils = useMemo(
    () => veilsFor(ink, [sky.zenith, sky.horizon]),
    [ink, sky.zenith, sky.horizon],
  );

  // Le défilement pilote deux choses dans le ciel, et rien d'autre : les
  // couches se décalent à des vitesses différentes vers le bas, et le jour se
  // lève quand on tire vers le haut. Tout se passe sur le fil d'animation, sans
  // qu'une seule image ait besoin du fil JS.
  // `set()` et non `.value =` : écrire dans une valeur partagée rendue par un
  // hook est refusé par la règle d'immutabilité du compilateur React, qui ne
  // peut pas savoir que celle-ci est faite pour être écrite.
  const onScroll = useAnimatedScrollHandler((event) => {
    const y = event.contentOffset.y;

    // La parallaxe se joue sur le premier écran. Au-delà, le ciel a fini de se
    // décaler ; continuer le ferait sortir par le haut.
    sky.scroll.set(Math.min(Math.max(y, 0), height) / height);

    // iOS rend un décalage négatif quand on rebondit au-delà du haut. Android
    // ne rebondit pas : il garde son indicateur de rafraîchissement, et le
    // lever du jour reste une gâterie d'iOS plutôt qu'un état inatteignable.
    sky.dawn.set(Math.min(Math.max(-y, 0), PULL) / PULL);
  });

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
        <PressableScale
          accessibilityRole="button"
          onPress={() => setFinderOpen(true)}
          reduced={reduced}
          style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Choisir une ville</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          onPress={() => refresh()}
          reduced={reduced}
          style={styles.textButton}>
          <Text style={[styles.textButtonText, { color: palette.ink }]}>
            Réessayer avec ma position
          </Text>
        </PressableScale>
        <PlacePicker
          onClose={() => setFinderOpen(false)}
          onSelect={selectPlace}
          reduced={reduced}
          searchPlaces={searchPlaces}
          visible={finderOpen}
        />
      </SafeAreaView>
    );
  }

  // L'écran moins ses marges (20 de chaque côté), moins celles de la carte (16).
  const chartWidth = width - 72;

  const garments = garmentsOf(selected);
  const parts = selected.phrasing.weatherParts;

  // Le rang dans l'entrée décalée : la tenue se pose pièce par pièce, puis ce
  // qu'on emporte, puis la suite, puis la météo. C'est l'ordre où on s'habille,
  // et c'est l'ordre où on lit.
  let rang = garments.length;
  const carryRang = selected.phrasing.carry ? rang++ : 0;
  const laterRang = selected.phrasing.later ? rang++ : 0;
  const weatherRang = rang;

  // La ligne sous le titre : la comparaison avec hier quand elle existe — c'est
  // le vrai repère du matin — sinon la région, qui dit qu'on regarde le bon
  // Paris. Jamais les deux : deux faits sur une ligne n'en laissent lire aucun.
  const subline = selected.phrasing.versusYesterday ?? regionOf(place);

  return (
    <View style={styles.root}>
      <SkyBackground height={height} state={sky} width={width} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veils.scrim }]} />

      <SafeAreaView style={styles.screen}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          onScroll={onScroll}
          refreshControl={<RefreshControl onRefresh={() => refresh()} refreshing={loading} tintColor={ink} />}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}>
          {/* Le lieu prend la ligne entière, et le jour choisi le suit dans la
              même phrase : c'est un seul sujet — « où, quand » — et non deux
              réglages qui se disputent la largeur. Le vestiaire, lui, se pose
              une fois pour toutes et n'a rien à faire à ce niveau-là. */}
          <View style={styles.topline}>
            <PressableScale
              accessibilityHint="Ouvre la recherche de ville"
              accessibilityLabel={`${cityOf(place)}, changer de ville`}
              accessibilityRole="button"
              onPress={() => setFinderOpen(true)}
              reduced={reduced}
              scaleTo={0.985}
              style={styles.placeButton}>
              {/* Pas de rôle « en-tête » ici : le titre est déjà l'étiquette
                  du bouton qui l'entoure, et deux rôles sur le même nœud font
                  annoncer la ville deux fois. */}
              <Text numberOfLines={2} style={styles.title}>
                <Text style={{ color: ink }}>{cityOf(place)}</Text>
                <Text style={{ color: muted }}> · {selected.label}</Text>
              </Text>
            </PressableScale>

            <PressableScale
              accessibilityHint="Change le vestiaire dans lequel les tenues sont choisies"
              accessibilityLabel={`Vestiaire : ${wardrobeLabel(profile)}`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setWardrobeOpen(true)}
              reduced={reduced}
              scaleTo={0.9}
              style={[styles.moreButton, { backgroundColor: veils.surface }]}>
              <View style={[styles.dot, { backgroundColor: ink }]} />
              <View style={[styles.dot, { backgroundColor: ink }]} />
              <View style={[styles.dot, { backgroundColor: ink }]} />
            </PressableScale>
          </View>

          {subline ? (
            <Text numberOfLines={1} style={[styles.subline, { color: muted }]}>
              {subline}
            </Text>
          ) : null}

          {/* La `key` refait naître tout le bloc à chaque jour choisi : c'est ce
              qui rejoue l'entrée décalée. Deviner ce qui a changé pour animer
              seulement ça coûterait plus cher que de tout reposer. */}
          <View key={selected.id} style={styles.hero}>
            {/* Un vêtement par ligne, dans l'ordre où on s'habille : l'œil
                saisit un empilement, il lit une liste à virgules. La phrase
                entière reste la seule chose que VoiceOver énonce — la découpe
                est visuelle, pas sémantique. */}
            <View accessible accessibilityLabel={selected.phrasing.wear} style={styles.garments}>
              {garments.map((piece, index) => (
                <Reveal index={index} key={piece} reduced={reduced}>
                  <Text style={[styles.garment, { color: ink }]}>{capitalize(piece)}</Text>
                </Reveal>
              ))}
            </View>

            {selected.phrasing.carry ? (
              <Reveal index={carryRang} reduced={reduced}>
                <Text style={[styles.carry, { color: ink }]}>{selected.phrasing.carry}</Text>
              </Reveal>
            ) : null}

            {/* Ce que la tenue du jour ne couvre pas : la seule ligne sur
                laquelle on peut encore agir en partant. */}
            {selected.phrasing.later ? (
              <Reveal index={laterRang} reduced={reduced}>
                <Text style={[styles.later, { color: ink, borderColor: `${ink}30` }]}>
                  {selected.phrasing.later}
                </Text>
              </Reveal>
            ) : null}

            {/* Le degré roule comme un compteur : c'est le seul nombre qui
                change quand on change de jour, et le voir tourner rend le
                changement lisible sans avoir à relire la phrase. */}
            <Reveal index={weatherRang} reduced={reduced} style={styles.weatherLine}>
              <Text style={[styles.weatherSentence, { color: muted }]}>{parts.before}</Text>
              <Odometer
                lineHeight={SENTENCE_LINE}
                reduced={reduced}
                style={[styles.weatherSentence, styles.weatherNumber, { color: muted }]}
                value={parts.value}
              />
              <Text style={[styles.weatherSentence, { color: muted }]}>{parts.after}</Text>
            </Reveal>
          </View>

          <DayRail
            days={days}
            horizon={sky.horizon}
            ink={ink}
            muted={muted}
            onSelect={setSelectedId}
            reduced={reduced}
            selectedId={selected.id}
            surface={veils.surface}
          />

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

          {/* Le vestiaire est parti derrière trois points en haut : cette phrase
              est ce qui l'empêche d'être introuvable. Elle dit lequel est actif,
              et elle rouvre la question. */}
          <PressableScale
            accessibilityHint="Change le vestiaire dans lequel les tenues sont choisies"
            accessibilityRole="button"
            onPress={() => setWardrobeOpen(true)}
            reduced={reduced}
            style={styles.wardrobeNote}>
            <Text style={[styles.wardrobeNoteText, { color: muted }]}>
              {wardrobeSentence(profile)} Changer.
            </Text>
          </PressableScale>
        </Animated.ScrollView>
      </SafeAreaView>

      <PlacePicker
        onClose={() => setFinderOpen(false)}
        onSelect={selectPlace}
        reduced={reduced}
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
  textButton: { justifyContent: 'center', minHeight: 48, marginTop: 12 },
  textButtonText: { fontSize: 16, fontWeight: '600' },
  topline: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingTop: 12 },
  placeButton: { flex: 1, justifyContent: 'center', minHeight: 44 },
  // Sans serif : le serif est réservé au conseil. Le titre est grand, il n'a
  // pas besoin d'être d'une autre famille pour se voir.
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 29 },
  subline: { fontSize: 15, lineHeight: 21, marginTop: 3 },
  // Trois points : muets, mais assez petits pour ne pas revendiquer la place
  // que le mot « Femme » prenait au même endroit.
  moreButton: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 3,
    height: 36,
    justifyContent: 'center',
    marginTop: 4,
    width: 36,
  },
  dot: { borderRadius: 2, height: 4, width: 4 },
  hero: { paddingBottom: 26, paddingTop: 30 },
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
  // Les trois morceaux sur une rangée, alignés par le haut : les textes et le
  // compteur partagent le même interligne, donc leurs lignes de base tombent
  // ensemble sans avoir à demander un alignement sur la ligne de base — que le
  // compteur, dont le contenu est décalé, ne saurait pas honorer.
  weatherLine: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 },
  weatherSentence: { fontSize: 16, lineHeight: SENTENCE_LINE },
  weatherNumber: { fontVariant: ['tabular-nums'] },
  details: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6 },
  notes: { marginTop: 30 },
  note: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  noteLabel: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  noteText: { fontSize: 15, lineHeight: 21 },
  confidence: { fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 20 },
  wardrobeNote: { justifyContent: 'center', marginTop: 26, minHeight: 44 },
  wardrobeNoteText: { fontSize: 14, lineHeight: 20 },
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
