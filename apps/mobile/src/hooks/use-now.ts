/**
 * L'heure courante, mais stable.
 *
 * Le ciel et le déroulé de la journée ont besoin de savoir quelle heure il est.
 * Un `new Date()` à chaque rendu leur donnerait une identité neuve à chaque
 * fois : le ciel repartirait en transition et le tracé se redessinerait sans
 * qu'il ne se soit rien passé.
 *
 * On ne change donc d'instant qu'au passage d'une heure — la granularité dont
 * ces deux modules se servent réellement — et au retour de l'app au premier
 * plan, pour qu'un téléphone rouvert à 18 h ne raconte plus la matinée.
 */

import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

const MINUTE = 60_000;

function startOfHour(date: Date) {
  const rounded = new Date(date);
  rounded.setMinutes(0, 0, 0);
  return rounded;
}

export function useNow(): Date {
  const [stamp, setStamp] = useState(() => startOfHour(new Date()).getTime());

  useEffect(() => {
    // Identique d'une minute sur l'autre : React ne rendra pas à nouveau.
    const tick = () => {
      const next = startOfHour(new Date()).getTime();
      setStamp((previous) => (previous === next ? previous : next));
    };

    const timer = setInterval(tick, MINUTE);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(timer);
      app.remove();
    };
  }, []);

  return useMemo(() => new Date(stamp), [stamp]);
}
