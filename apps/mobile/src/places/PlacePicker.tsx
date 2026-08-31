/**
 * La recherche de ville, partagée par l'accueil et l'éditeur de voyage.
 *
 * Le résultat ne transporte aucune logique météo : il ne fait que rendre le
 * lieu choisi. L'accueil y demande ensuite une prévision ; l'éditeur le range
 * dans une étape.
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import type { Place } from '@/lib/types';
import { PressableScale } from '@/motion/PressableScale';
import { Reveal } from '@/motion/Reveal';

export function PlacePicker({
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
  const dark = useColorScheme() === 'dark';
  const colors = dark
    ? {
        border: '#3E525E',
        button: '#F3F7FA',
        buttonText: '#10242F',
        ink: '#F3F7FA',
        input: '#1C2A32',
        muted: '#B8C8D1',
        sheet: '#10191F',
      }
    : {
        border: '#C3D0D5',
        button: '#10242F',
        buttonText: '#FFFFFF',
        ink: '#10242F',
        input: '#FFFFFF',
        muted: '#425A66',
        sheet: '#F7FAFB',
      };

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

    try {
      await onSelect(place);
      setStatus(null);
      setQuery('');
      setResults([]);
      onClose();
    } catch {
      setStatus('Ce lieu ne peut pas être choisi pour le moment. Réessaie dans un instant.');
    }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={[styles.sheet, { backgroundColor: colors.sheet }]}>
        <View style={styles.sheetHeader}>
          <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.ink }]}>
            Choisir une ville
          </Text>
          <PressableScale
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            reduced={reduced}
            style={styles.closeButton}>
            <Text style={[styles.closeText, { color: colors.ink }]}>Fermer</Text>
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
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={[styles.searchInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.ink }]}
            value={query}
          />
          <PressableScale
            accessibilityRole="button"
            onPress={search}
            reduced={reduced}
            style={[styles.searchButton, { backgroundColor: colors.button }]}>
            <Text style={[styles.searchButtonText, { color: colors.buttonText }]}>Chercher</Text>
          </PressableScale>
        </View>
        {status ? <Text style={[styles.searchStatus, { color: colors.muted }]}>{status}</Text> : null}
        <ScrollView contentContainerStyle={styles.searchResults} keyboardShouldPersistTaps="handled">
          {results.map((place, rang) => (
            <Reveal index={rang} key={`${place.latitude}-${place.longitude}`} reduced={reduced}>
              <PressableScale
                accessibilityLabel={`Choisir ${place.name}`}
                accessibilityRole="button"
                onPress={() => choose(place)}
                reduced={reduced}
                style={[styles.placeResult, { borderBottomColor: colors.border }]}>
                <Text style={[styles.placeResultText, { color: colors.ink }]}>{place.name}</Text>
              </PressableScale>
            </Reveal>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  closeButton: { justifyContent: 'center', minHeight: 44 },
  closeText: { fontSize: 16, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 22 },
  searchInput: { borderRadius: 12, borderWidth: 1, flex: 1, fontSize: 16, minHeight: 48, paddingHorizontal: 13 },
  searchButton: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
  searchButtonText: { fontSize: 15, fontWeight: '700' },
  searchStatus: { fontSize: 15, lineHeight: 22, marginTop: 16 },
  searchResults: { paddingTop: 12 },
  placeResult: { borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 56 },
  placeResultText: { fontSize: 16 },
});
