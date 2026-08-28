/**
 * Le voyage courant, sa prévision et sa valise.
 *
 * Une requête par étape : `forecast_days` compte depuis aujourd'hui, donc on
 * demande de aujourd'hui à la fin de l'étape, puis `buildTrip` découpe. Quelques
 * journées de trop dans la réponse ne coûtent rien — le service est gratuit et
 * sans clé — et cela évite une arithmétique de fenêtre en double.
 *
 * Une étape dont la requête échoue passe un tableau vide : la valise se
 * construit sur les autres, et ses jours partent dans `horizon.missing`. Pas
 * d'écran d'erreur pour une ville sur trois.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { applyPacked, buildTrip, describePacking } from '@/core/packing';
import { fetchForecast } from '@/core/weather';
// Metro sélectionne storage.native.ts ou storage.web.ts selon la plateforme.
// eslint-disable-next-line import/no-unresolved
import { getStoredTrips, storeTrips } from '@/lib/storage';
import type { DayWeather, Packing, PackingWords, Profile, Trip } from '@/lib/types';

/** La fenêtre que les modèles couvrent. Au-delà, la météo n'existe pas encore. */
export const HORIZON_DAYS = 16;

/** Aujourd'hui, en date ISO courte, à l'heure de l'appareil. */
function today() {
  const at = new Date();
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Combien de journées demander pour couvrir jusqu'à `date`. */
function daysUntil(date: string) {
  const jours =
    Math.round(
      (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) /
        86400000,
    ) + 1;

  return Math.min(HORIZON_DAYS, Math.max(1, jours));
}

/** La borne de fin d'une étape : la veille de la suivante, ou le retour. */
function legEnd(trip: Trip, index: number) {
  const suivante = trip.stops[index + 1];
  if (!suivante) return trip.end;

  const t = new Date(`${suivante.from}T12:00:00Z`).getTime() - 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function useTrip(profile: Profile | null) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<DayWeather[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Le voyage courant : celui qu'on regarde, sinon le premier dont la fin n'est
  // pas passée. Un séjour terminé n'ouvre pas une valise pour un voyage fini.
  const trip = useMemo(() => {
    if (selectedId) return trips.find((t) => t.id === selectedId) ?? null;

    const jour = today();
    return trips.filter((t) => t.end >= jour).sort((a, b) => (a.start < b.start ? -1 : 1))[0] ?? null;
  }, [trips, selectedId]);

  useEffect(() => {
    let vivant = true;

    getStoredTrips()
      .then((stored) => {
        if (vivant) setTrips(stored);
      })
      .finally(() => {
        if (vivant) setLoading(false);
      });

    return () => {
      vivant = false;
    };
  }, []);

  const load = useCallback(async (cible: Trip | null) => {
    if (!cible) {
      setForecasts([]);
      return;
    }

    setLoading(true);
    setError(null);

    const resultats = await Promise.all(
      cible.stops.map(async (stop, index) => {
        try {
          return (await fetchForecast(
            stop.place.latitude,
            stop.place.longitude,
            daysUntil(legEnd(cible, index)),
            0,
          )) as DayWeather[];
        } catch {
          // Une étape muette n'empêche pas les autres : ses jours iront dans
          // `horizon.missing`, et la ligne le dira.
          return [] as DayWeather[];
        }
      }),
    );

    setForecasts(resultats);
    setLoading(false);

    if (resultats.every((jours) => jours.length === 0)) {
      setError('La météo est indisponible pour le moment. Réessaie dans un instant.');
    }
  }, []);

  // `load` pose `loading`/`error` avant son premier `await` : appelée à même le
  // corps de l'effet, la mise à jour serait synchrone et déclencherait un rendu
  // en cascade. Un tour de micro-tâche la reporte, comme `refresh` dans
  // `use-forecast.ts`.
  useEffect(() => {
    void Promise.resolve().then(() => load(trip));
  }, [load, trip]);

  const packing = useMemo<Packing | null>(() => {
    if (!trip || forecasts.length === 0) return null;

    const brut = buildTrip(trip, forecasts, new Date(), profile) as Packing;
    return applyPacked(brut, trip.packed) as Packing;
  }, [trip, forecasts, profile]);

  const words = useMemo<PackingWords | null>(
    () => (packing ? (describePacking(packing) as PackingWords) : null),
    [packing],
  );

  const save = useCallback(async (next: Trip) => {
    const suivants = [...trips.filter((t) => t.id !== next.id), next];
    setTrips(suivants);
    setSelectedId(next.id);
    await storeTrips(suivants);
  }, [trips]);

  const remove = useCallback(async (id: string) => {
    const suivants = trips.filter((t) => t.id !== id);
    setTrips(suivants);
    if (selectedId === id) setSelectedId(null);
    await storeTrips(suivants);
  }, [trips, selectedId]);

  const refresh = useCallback(() => load(trip), [load, trip]);

  return {
    trips,
    trip,
    packing,
    words,
    loading,
    error,
    save,
    remove,
    select: setSelectedId,
    refresh,
  };
}
