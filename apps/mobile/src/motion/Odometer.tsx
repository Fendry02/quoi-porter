/**
 * Un nombre dont les chiffres roulent, comme un compteur mécanique.
 *
 * Chaque rang porte son propre ruban de 0 à 9, décalé jusqu'au chiffre voulu.
 * Un ressort plutôt qu'une durée : le nombre arrive, dépasse d'un cheveu, se
 * pose. C'est ce dépassement qui fait la mécanique ; sans lui on aurait un
 * fondu déguisé.
 *
 * Le ruban roule à l'envers quand le chiffre descend — de 9 vers 1 il repasse
 * par 8, 7, 6. C'est voulu : un compteur qui ne saurait que monter mentirait
 * sur une température qui baisse.
 *
 * La hauteur de ligne est demandée plutôt que mesurée : mesurer imposerait une
 * passe de layout avant de savoir de combien décaler, donc un premier rendu
 * faux, donc un sursaut à l'ouverture.
 */

import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Ferme, avec juste assez de dépassement pour qu'on sente le cran. */
const ROLL = { mass: 0.7, damping: 16, stiffness: 190 };

function Digit({
  digit,
  lineHeight,
  reduced,
  style,
}: {
  digit: number;
  lineHeight: number;
  reduced: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const position = useSharedValue(digit);

  useEffect(() => {
    position.value = reduced ? digit : withSpring(digit, ROLL);
  }, [digit, position, reduced]);

  const strip = useAnimatedStyle(() => ({
    transform: [{ translateY: -position.value * lineHeight }],
  }));

  return (
    <View style={[styles.window, { height: lineHeight }]}>
      <Animated.View style={strip}>
        {DIGITS.map((d) => (
          <Text key={d} style={[style, { height: lineHeight, lineHeight }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export function Odometer({
  value,
  lineHeight,
  reduced = false,
  style,
}: {
  value: number;
  /** La distance dont chaque ruban se décale, et la hauteur de la fenêtre. */
  lineHeight: number;
  reduced?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const rounded = Math.round(value);
  const chiffres = String(Math.abs(rounded)).split('');

  // VoiceOver lit le nombre entier : dix rubans de dix chiffres chacun n'ont
  // aucun sens à l'oreille.
  return (
    <View accessibilityLabel={String(rounded)} accessible style={styles.row}>
      {rounded < 0 ? <Text style={style}>−</Text> : null}
      {chiffres.map((chiffre, rang) => (
        <Digit
          digit={Number(chiffre)}
          // Le rang depuis la droite : ainsi le chiffre des unités garde son
          // ruban quand le nombre passe de 9 à 10, au lieu de tout remonter.
          key={chiffres.length - rang}
          lineHeight={lineHeight}
          reduced={reduced}
          style={style}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  window: { overflow: 'hidden' },
});
