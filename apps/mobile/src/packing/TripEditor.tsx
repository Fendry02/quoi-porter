/**
 * Où l'on va, et quand.
 *
 * Une étape ne demande que son jour d'arrivée : son dernier jour est le jour
 * avant l'étape suivante. Les trous et les chevauchements restent donc
 * impossibles à créer depuis l'interface.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { HORIZON_DAYS } from '@/hooks/use-trip';
import type { Place, Trip, TripStop } from '@/lib/types';
import { PressableScale } from '@/motion/PressableScale';
import { DateGrid } from '@/packing/DateGrid';

export function TripEditor({
  initial,
  onDone,
  onCancel,
  openPlaceFinder,
  reduced,
}: {
  initial: Trip | null;
  onDone: (trip: Trip) => void | Promise<void>;
  onCancel: () => void;
  openPlaceFinder: () => Promise<Place | null>;
  reduced: boolean;
}) {
  const [start, setStart] = useState<string | null>(initial?.start ?? null);
  const [end, setEnd] = useState<string | null>(initial?.end ?? null);
  const [stops, setStops] = useState<TripStop[]>(initial?.stops ?? []);

  async function addStop(from: string) {
    const place = await openPlaceFinder();
    if (!place || !start) return;

    const stop = { place, from };
    setStops((current) =>
      [...current.filter((candidate) => candidate.from !== stop.from), stop].sort((a, b) =>
        a.from < b.from ? -1 : 1,
      ),
    );
  }

  /** Un appui pose l'arrivée, le suivant le retour ; ensuite un jour intérieur ajoute une étape. */
  function pickDate(date: string) {
    if (!start) {
      setStart(date);
      return;
    }

    if (!end) {
      if (date < start) {
        setStart(date);
        setStops((current) => current.slice(0, 1).map((stop) => ({ ...stop, from: date })));
        return;
      }

      setEnd(date);
      return;
    }

    if (date > start && date <= end) {
      void addStop(date);
      return;
    }

    setStart(date);
    setEnd(null);
    setStops((current) => current.slice(0, 1).map((stop) => ({ ...stop, from: date })));
  }

  const complete = Boolean(start && end && stops.length > 0 && stops[0].from === start);

  return (
    <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>
        Tu pars quand ?
      </Text>

      <DateGrid
        from={start}
        horizonDays={HORIZON_DAYS}
        ink="#10242F"
        muted="#66747D"
        onPick={pickDate}
        reduced={reduced}
        surface="#E4ECEF"
        to={end}
      />
      <Text style={styles.hint}>Au-delà de seize jours, la météo n’existe pas encore.</Text>

      {start ? (
        <View style={styles.stops}>
          <Text accessibilityRole="header" style={styles.subtitle}>
            Où ?
          </Text>

          {stops.map((stop) => (
            <View key={stop.from} style={styles.stop}>
              <Text style={styles.stopPlace}>{stop.place.name.split(',')[0]}</Text>
              <Text style={styles.stopFrom}>
                {stop.from === start ? 'à l’arrivée' : `à partir du ${Number(stop.from.slice(8))}`}
              </Text>
              {stop.from === start ? null : (
                <PressableScale
                  accessibilityLabel={`Retirer ${stop.place.name.split(',')[0]}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setStops((current) => current.filter((candidate) => candidate.from !== stop.from))}
                  reduced={reduced}
                  style={styles.remove}>
                  <Text style={styles.removeText}>Retirer</Text>
                </PressableScale>
              )}
            </View>
          ))}

          {stops.length === 0 ? (
            <PressableScale
              accessibilityRole="button"
              onPress={() => void addStop(start)}
              reduced={reduced}
              style={styles.action}>
              <Text style={styles.actionText}>Choisir la ville</Text>
            </PressableScale>
          ) : end ? (
            <Text style={styles.stepHint}>Touche un jour du séjour pour y ajouter une étape.</Text>
          ) : null}
        </View>
      ) : null}

      <PressableScale
        accessibilityRole="button"
        disabled={!complete}
        onPress={() => {
          if (!complete || !start || !end) return;
          void onDone({
            id: initial?.id ?? `trip-${Date.now()}`,
            start,
            end,
            stops,
            packed: initial?.packed ?? [],
          });
        }}
        reduced={reduced}
        style={[styles.primary, complete ? null : styles.disabled]}>
        <Text style={styles.primaryText}>Voir ma valise</Text>
      </PressableScale>

      <PressableScale accessibilityRole="button" onPress={onCancel} reduced={reduced} style={styles.action}>
        <Text style={styles.actionText}>Annuler</Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#F7FAFB', flexGrow: 1, paddingHorizontal: 20, paddingTop: 18 },
  title: { color: '#10242F', fontSize: 22, fontWeight: '700', marginBottom: 18 },
  primary: {
    alignItems: 'center',
    backgroundColor: '#10242F',
    borderRadius: 14,
    marginTop: 28,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  action: { justifyContent: 'center', minHeight: 44, marginTop: 12 },
  actionText: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  hint: { color: '#425A66', fontSize: 14, lineHeight: 20, marginTop: 10 },
  subtitle: { color: '#10242F', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  stops: { marginTop: 26 },
  stop: {
    alignItems: 'center',
    borderBottomColor: '#C3D0D5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
  },
  stopPlace: { color: '#10242F', flex: 1, fontSize: 16 },
  stopFrom: { color: '#66747D', fontSize: 14 },
  remove: { justifyContent: 'center', minHeight: 44 },
  removeText: { color: '#66747D', fontSize: 14, fontWeight: '600' },
  stepHint: { color: '#425A66', fontSize: 14, lineHeight: 20, marginTop: 12 },
});
