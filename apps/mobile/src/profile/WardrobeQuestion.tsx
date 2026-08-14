/**
 * Le vestiaire dans lequel piocher : demandé au premier lancement, et
 * modifiable ensuite depuis l'écran principal.
 *
 * La question sert à une seule chose : savoir s'il faut proposer la jupe quand
 * il fait doux. On le dit, plutôt que de demander une information personnelle
 * sans expliquer ce qu'on en fait.
 *
 * Le troisième choix n'est pas une politesse. Un écran d'accueil dont on ne
 * peut pas sortir sans se ranger dans une case serait un piège, et le produit
 * tient à rester utile sans configuration.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Profile } from '@/lib/types';

const CHOICES: { id: Profile; label: string; hint: string }[] = [
  { id: 'femme', label: 'Femme', hint: 'La jupe apparaît quand il fait doux.' },
  { id: 'homme', label: 'Homme', hint: 'Pantalon, jean et short.' },
  { id: 'neutre', label: 'Je préfère ne pas dire', hint: 'La garde-robe commune, sans supposition.' },
];

/** Le mot qui résume le choix courant, pour le bouton qui rouvre la question. */
export function wardrobeLabel(profile: Profile | null) {
  if (profile === 'femme') return 'Femme';
  if (profile === 'homme') return 'Homme';
  return 'Vestiaire';
}

export function WardrobeQuestion({
  current,
  onChoose,
  onClose,
}: {
  current?: Profile | null;
  onChoose: (profile: Profile) => void;
  /** Absent au premier lancement : il n'y a alors rien derrière à retrouver. */
  onClose?: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          Dans quel vestiaire je pioche ?
        </Text>
        <Text style={styles.subtitle}>
          Ça reste sur ton téléphone, et ça ne sert qu’à ajuster les vêtements proposés.
        </Text>
      </View>

      <View style={styles.choices}>
        {CHOICES.map((choice) => {
          const active = choice.id === current;

          return (
            <Pressable
              accessibilityHint={choice.hint}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={choice.id}
              onPress={() => onChoose(choice.id)}
              style={({ pressed }) => [
                styles.choice,
                active && styles.choiceActive,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>
                {choice.label}
              </Text>
              <Text style={[styles.choiceHint, active && styles.choiceHintActive]}>
                {choice.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {onClose ? (
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Text style={styles.closeText}>Garder ce choix</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#DCEEFF', flex: 1, justifyContent: 'center', padding: 24 },
  intro: { marginBottom: 32 },
  title: { color: '#10242F', fontSize: 30, fontWeight: '700', letterSpacing: -0.6, lineHeight: 36 },
  subtitle: { color: '#425A66', fontSize: 16, lineHeight: 23, marginTop: 12 },
  choices: { gap: 12 },
  choice: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  choiceActive: { backgroundColor: '#10242F' },
  choiceLabel: { color: '#10242F', fontSize: 17, fontWeight: '700' },
  choiceLabelActive: { color: '#FFFFFF' },
  choiceHint: { color: '#425A66', fontSize: 14, lineHeight: 20, marginTop: 3 },
  choiceHintActive: { color: '#C3D0D5' },
  close: { alignItems: 'center', justifyContent: 'center', marginTop: 24, minHeight: 48 },
  closeText: { color: '#10242F', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
