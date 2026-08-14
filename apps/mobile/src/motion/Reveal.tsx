/**
 * Une entrée qui monte et se révèle, décalée par rang.
 *
 * C'est ce qui fait qu'une tenue se *pose* au lieu d'être déjà là : le t-shirt,
 * puis le pull, puis le jean, puis les chaussures, dans l'ordre où on s'habille.
 * Soixante millisecondes d'écart suffisent — au-delà, on attend la réponse au
 * lieu de la lire, et c'est une app qu'on ouvre pressé.
 *
 * Le composant s'anime au montage et jamais ensuite. Pour rejouer l'entrée à
 * chaque jour choisi, on donne au parent une `key` qui change : le remontage
 * est plus sûr qu'un effet qui tenterait de deviner ce qui a bougé.
 */

import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/** De combien la ligne monte en apparaissant. */
const RISE = 14;

/** L'écart entre deux rangs successifs. */
const STEP_MS = 60;

const DURATION_MS = 420;

export function Reveal({
  children,
  index = 0,
  reduced = false,
  style,
}: {
  children: React.ReactNode;
  /** Le rang dans la série, qui décide du retard. */
  index?: number;
  reduced?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // Déjà en place quand le mouvement est réduit : on ne veut ni le glissement,
  // ni le fondu, ni l'attente qu'il impose avant de pouvoir lire.
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }

    progress.value = withDelay(
      index * STEP_MS,
      withTiming(1, { duration: DURATION_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [index, progress, reduced]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
