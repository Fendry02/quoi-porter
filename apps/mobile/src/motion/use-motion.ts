/**
 * Le réglage « mouvement réduit » du système, en direct et sous deux formes.
 *
 * `useReducedMotion()` de Reanimated ne lit le réglage qu'au démarrage. Qui
 * l'active depuis les réglages pendant que l'app est ouverte garderait donc
 * toutes les animations, ce qui est exactement le cas qu'il vient de demander
 * d'éviter. On écoute l'événement.
 *
 * Deux formes parce qu'il y a deux mondes : le rendu React lit `reduced`, les
 * worklets lisent `allowed` — ils tournent sur le fil d'animation et n'ont
 * aucun accès à l'état React.
 *
 * Un seul appel dans l'écran, puis on passe l'objet : deux appels créeraient
 * deux abonnements pour un réglage unique.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export type Motion = {
  /** Vrai quand le système demande de réduire le mouvement. */
  reduced: boolean;
  /** 1 quand le mouvement est permis, 0 sinon. Lisible depuis un worklet. */
  allowed: SharedValue<number>;
};

export function useMotion(): Motion {
  const [reduced, setReduced] = useState(false);
  const allowed = useSharedValue(1);

  useEffect(() => {
    let alive = true;

    const apply = (value: boolean) => {
      if (!alive) return;
      setReduced(value);
      allowed.value = value ? 0 : 1;
    };

    AccessibilityInfo.isReduceMotionEnabled().then(apply);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);

    return () => {
      alive = false;
      motion.remove();
    };
  }, [allowed]);

  return { reduced, allowed };
}
