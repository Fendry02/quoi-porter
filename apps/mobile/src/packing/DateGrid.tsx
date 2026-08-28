/**
 * Les seize jours qui existent, en sept colonnes.
 *
 * Le choix des dates est l'horizon : pas de calendrier qui laisse viser dans
 * trois semaines pour s'excuser ensuite. Un séjour se voit comme un bloc
 * contigu, et ce qui n'est pas proposé n'a pas besoin d'être expliqué.
 *
 * La grille commence au lundi de la semaine d'aujourd'hui pour que les colonnes
 * portent un jour de semaine constant ; les cases d'avant aujourd'hui sont
 * vides, non grisées — une case vide ne se touche pas, et ne demande pas
 * pourquoi elle ne se touche pas.
 */

import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/motion/PressableScale';

const COLUMNS = 7;
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function isoOf(at: Date) {
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDays(date: string, n: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Les cases à dessiner : du lundi de la semaine courante jusqu'au seizième jour,
 * complétées jusqu'à la fin de la dernière ligne.
 */
function cellsOf(today: string, horizonDays: number) {
  const jour = new Date(`${today}T12:00:00Z`).getUTCDay();
  const depuisLundi = (jour + 6) % 7;
  const debut = addDays(today, -depuisLundi);
  const fin = addDays(today, horizonDays - 1);

  const cells: string[] = [];
  for (let date = debut; date <= fin; date = addDays(date, 1)) cells.push(date);
  while (cells.length % COLUMNS !== 0) cells.push(addDays(cells[cells.length - 1], 1));

  return { cells, fin };
}

export function DateGrid({
  from,
  to,
  ink,
  muted,
  surface,
  reduced,
  min,
  max,
  horizonDays,
  onPick,
}: {
  from: string | null;
  to: string | null;
  ink: string;
  muted: string;
  surface: string;
  reduced: boolean;
  min?: string;
  max?: string;
  horizonDays: number;
  onPick: (date: string) => void;
}) {
  const today = isoOf(new Date());
  const { cells, fin } = cellsOf(today, horizonDays);
  const bas = min ?? today;
  const haut = max ?? fin;

  return (
    <View>
      <View style={styles.header}>
        {WEEKDAYS.map((lettre, index) => (
          <Text key={`${lettre}-${index}`} style={[styles.weekday, { color: muted }]}>
            {lettre}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date) => {
          const atteignable = date >= bas && date <= haut;
          const dansLeSejour = from && to && date >= from && date <= to;
          const borne = date === from || date === to;

          if (!atteignable) {
            return <View key={date} style={styles.cell} />;
          }

          return (
            <PressableScale
              accessibilityLabel={labelOf(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: Boolean(borne || dansLeSejour) }}
              key={date}
              onPress={() => onPick(date)}
              reduced={reduced}
              scaleTo={0.92}
              style={[
                styles.cell,
                dansLeSejour ? { backgroundColor: surface } : null,
                borne ? { backgroundColor: ink } : null,
              ]}>
              <Text
                style={[
                  styles.day,
                  { color: borne ? surface : ink },
                  date === today ? styles.today : null,
                ]}>
                {Number(date.slice(8))}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** Le libellé lu par VoiceOver : un chiffre seul ne dit pas quel jour. */
function labelOf(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row' },
  weekday: { flexBasis: `${100 / COLUMNS}%`, fontSize: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  // 44 de haut : la cible tactile minimale, sur laquelle la pastille est centrée.
  cell: {
    alignItems: 'center',
    borderRadius: 12,
    flexBasis: `${100 / COLUMNS}%`,
    height: 44,
    justifyContent: 'center',
  },
  day: { fontSize: 16, fontVariant: ['tabular-nums'] },
  today: { fontWeight: '700' },
});
