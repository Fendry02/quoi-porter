/**
 * Le vestiaire de qui lit, demandé une fois puis gardé sur l'appareil.
 *
 * Tant qu'on ne sait pas encore (`loading`), on n'affiche ni la question ni la
 * tenue : montrer l'écran d'accueil le temps d'une lecture disque le ferait
 * clignoter à chaque ouverture.
 */

import { useCallback, useEffect, useState } from 'react';

// Metro sélectionne storage.native.ts ou storage.web.ts selon la plateforme.
// eslint-disable-next-line import/no-unresolved
import { getStoredProfile, storeProfile } from '@/lib/storage';
import type { Profile } from '@/lib/types';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivant = true;

    getStoredProfile()
      .then((stored) => {
        if (!vivant) return;
        setProfile(stored);
      })
      .finally(() => {
        if (vivant) setLoading(false);
      });

    return () => {
      vivant = false;
    };
  }, []);

  const choose = useCallback(async (next: Profile) => {
    setProfile(next);
    await storeProfile(next);
  }, []);

  return { profile, loading, choose };
}
