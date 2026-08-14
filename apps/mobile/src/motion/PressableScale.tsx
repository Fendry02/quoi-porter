/**
 * Un pressable qui s'enfonce, au lieu de pâlir.
 *
 * `opacity: 0.72` sur l'appui est le réflexe du web : ça marque le contact mais
 * ça n'a aucun corps. Une échelle sur ressort en a un — le doigt appuie sur
 * quelque chose, et le relâchement rend la pression. Deux ressorts différents,
 * parce que l'appui doit être immédiat là où le retour peut respirer.
 *
 * Sous mouvement réduit, on retombe sur l'opacité : le contact doit rester
 * visible même quand le mouvement ne l'est plus.
 */

import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** L'appui : raide et amorti, pour qu'il soit sous le doigt sans rebondir. */
const DOWN = { mass: 0.4, damping: 15, stiffness: 420 };

/** Le relâchement : un peu plus lâche, on lui laisse le rebond. */
const UP = { mass: 0.5, damping: 11, stiffness: 300 };

export function PressableScale({
  children,
  reduced = false,
  scaleTo = 0.965,
  style,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  reduced?: boolean;
  /** Jusqu'où l'élément s'enfonce. Plus grand pour les petites cibles. */
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const down = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    opacity: 1 - down.value * (reduced ? 0.28 : 0.1),
    transform: [{ scale: reduced ? 1 : 1 - down.value * (1 - scaleTo) }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        down.value = withSpring(1, DOWN);
      }}
      onPressOut={() => {
        down.value = withSpring(0, UP);
      }}
      style={[style, animated]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}
