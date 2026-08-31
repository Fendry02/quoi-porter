/** Les voyages gardés sur l'appareil, y compris les séjours terminés. */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Trip } from '@/lib/types';
import { PressableScale } from '@/motion/PressableScale';

function todayIso() {
  const at = new Date();
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function titleOf(trip: Trip) {
  return trip.stops.map((stop) => stop.place.name.split(',')[0].trim()).join(' → ');
}

function datesOf(trip: Trip) {
  const dayAndMonth = (date: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
      new Date(`${date}T12:00:00`),
    );

  return `${dayAndMonth(trip.start)} → ${dayAndMonth(trip.end)}`;
}

export function TripLibrary({
  trips,
  currentId,
  onSelect,
  onRemove,
  onCreate,
  onClose,
  reduced,
}: {
  trips: Trip[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
  reduced: boolean;
}) {
  const today = todayIso();
  const byDate = [...trips].sort((a, b) => (a.start < b.start ? -1 : 1));
  const upcoming = byDate.filter((trip) => trip.end >= today);
  const past = byDate.filter((trip) => trip.end < today).reverse();

  function row(trip: Trip, finished: boolean) {
    const title = titleOf(trip);

    return (
      <View key={trip.id} style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ selected: trip.id === currentId }}
          onPress={() => onSelect(trip.id)}
          reduced={reduced}
          style={styles.rowMain}>
          <Text style={[styles.rowTitle, finished ? styles.faded : null]}>{title}</Text>
          <Text style={[styles.rowDates, finished ? styles.faded : null]}>{datesOf(trip)}</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel={`Retirer ${title}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onRemove(trip.id)}
          reduced={reduced}
          style={styles.remove}>
          <Text style={styles.removeText}>Retirer</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.sheet}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Mes voyages
        </Text>
        <PressableScale accessibilityRole="button" hitSlop={10} onPress={onClose} reduced={reduced} style={styles.close}>
          <Text style={styles.closeText}>Fermer</Text>
        </PressableScale>
      </View>

      {upcoming.map((trip) => row(trip, false))}

      {past.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={styles.section}>
            Passés
          </Text>
          {past.map((trip) => row(trip, true))}
        </>
      ) : null}

      <PressableScale accessibilityRole="button" onPress={onCreate} reduced={reduced} style={styles.primary}>
        <Text style={styles.primaryText}>Nouveau voyage</Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#F7FAFB', flexGrow: 1, paddingHorizontal: 20, paddingTop: 18 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  title: { color: '#10242F', fontSize: 22, fontWeight: '700' },
  close: { justifyContent: 'center', minHeight: 44 },
  closeText: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  section: { color: '#66747D', fontSize: 13, letterSpacing: 0.6, marginTop: 26, textTransform: 'uppercase' },
  row: {
    alignItems: 'center',
    borderBottomColor: '#C3D0D5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
  },
  rowMain: { flex: 1, justifyContent: 'center', minHeight: 64 },
  rowTitle: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  rowDates: { color: '#66747D', fontSize: 14, marginTop: 2 },
  faded: { opacity: 0.5 },
  remove: { justifyContent: 'center', minHeight: 44 },
  removeText: { color: '#66747D', fontSize: 14, fontWeight: '600' },
  primary: {
    alignItems: 'center',
    backgroundColor: '#10242F',
    borderRadius: 14,
    marginTop: 28,
    minHeight: 48,
    paddingVertical: 13,
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
