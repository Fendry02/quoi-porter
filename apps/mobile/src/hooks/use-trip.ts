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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { applyPacked, buildTrip, describePacking, prunePacked } from '@/core/packing';
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
  // `trips` vaut `[]` à la fois avant la lecture du disque et une fois
  // qu'on sait la bibliothèque vide : sans ce drapeau, rien ne distingue
  // « pas encore lu » de « lu, et il n'y a rien ». Seul `pret` porte cette
  // distinction.
  const [pret, setPret] = useState(false);

  // Le voyage courant : celui qu'on regarde, sinon le premier dont la fin n'est
  // pas passée. Un séjour terminé n'ouvre pas une valise pour un voyage fini.
  const trip = useMemo(() => {
    if (selectedId) return trips.find((t) => t.id === selectedId) ?? null;

    const jour = today();
    return trips.filter((t) => t.end >= jour).sort((a, b) => (a.start < b.start ? -1 : 1))[0] ?? null;
  }, [trips, selectedId]);

  // Les coches changent l'objet `trip`, sans changer les requêtes à faire. Une
  // clé stable du séjour évite qu'un t-shirt coché rappelle Open-Meteo.
  const stopsKey = trip
    ? `${trip.id}:${trip.start}:${trip.end}:${trip.stops.map((stop) => `${stop.from}@${stop.place.name}`).join('|')}`
    : null;

  useEffect(() => {
    let vivant = true;

    getStoredTrips()
      .then((stored) => {
        if (vivant) setTrips(stored);
      })
      .finally(() => {
        // Pas `setLoading(false)` ici : tant qu'on ne sait pas s'il existe un
        // voyage courant, dire qu'on a fini de charger serait faux, que la
        // réponse arrive ensuite d'un vrai voyage ou du constat qu'il n'y en
        // a aucun. `pret` porte cette seule information — « la bibliothèque a
        // été lue » — et laisse `load` décider seul du sort de `loading`.
        if (vivant) setPret(true);
      });

    return () => {
      vivant = false;
    };
  }, []);

  // Le numéro du dernier `load` lancé. `select` pendant qu'une prévision
  // circule encore ne doit pas la laisser gagner : sans ce compteur, la
  // réponse la plus lente écraserait `forecasts` en dernier, et la valise
  // affichée mélangerait le voyage à l'écran avec la météo d'un voyage déjà
  // quitté — silencieusement, puisque `legsOf` accouple par position et ne
  // peut pas s'apercevoir que le couple ne correspond plus.
  const generation = useRef(0);

  const load = useCallback(async (cible: Trip | null) => {
    const ici = ++generation.current;

    if (!cible) {
      // État terminal d'« aucun voyage » : rien ne charge, rien n'a échoué,
      // donc les trois s'écrivent ici. La garde de génération empêche
      // justement un appel dépassé de venir remettre `loading`/`error` à
      // plat à notre place — ce `setLoading(false)` défait le
      // `setLoading(true)` d'un appel précédent encore en vol, pas le sien,
      // et `setError(null)` efface pareillement la bannière d'un échec dont
      // le voyage vient de disparaître.
      setForecasts([]);
      setLoading(false);
      setError(null);
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

    // Une sélection plus récente est arrivée pendant l'attente : ce résultat
    // décrit un voyage qu'on ne regarde déjà plus, il n'écrit rien. Un
    // `refresh()` du voyage courant, lui, obtient son propre numéro et
    // s'écrit normalement — seul un appel doublé par un autre est ignoré.
    if (ici !== generation.current) return;

    setForecasts(resultats);
    setLoading(false);

    if (resultats.every((jours) => jours.length === 0)) {
      setError('La météo est indisponible pour le moment. Réessaie dans un instant.');
    }
  }, []);

  // On attend d'avoir lu la bibliothèque avant de charger quoi que ce soit :
  // partir plus tôt ferait passer `trip` pour `null` au sens de « aucun
  // voyage », alors qu'il ne vaut encore `null` que parce que `trips` n'a pas
  // fini de se lire. `load(null)` conclurait alors à tort, dès le montage, et
  // `loading` retomberait à `false` avant même de savoir si un vrai voyage
  // attend derrière. Même garde que `profile === null` dans
  // `use-forecast.ts`, pour la même raison : ne pas tirer de conclusion avant
  // d'avoir la donnée qui permet de la tirer.
  //
  // `load` pose aussi `loading`/`error` avant son premier `await` : appelée à
  // même le corps de l'effet, la mise à jour serait synchrone et
  // déclencherait un rendu en cascade. Un tour de micro-tâche la reporte,
  // comme `refresh` dans `use-forecast.ts`.
  useEffect(() => {
    if (!pret) return;
    void Promise.resolve().then(() => load(trip));
    // `trip` est volontairement absent : `stopsKey` est précisément la partie
    // qui doit déclencher une nouvelle prévision. Les coches restent locales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, pret, stopsKey]);

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

  /** Cocher une ligne ne recharge pas la météo : seul le contenu du sac change. */
  const toggle = useCallback(
    async (key: string) => {
      if (!trip) return;

      const packed = trip.packed.includes(key)
        ? trip.packed.filter((candidate) => candidate !== key)
        : [...trip.packed, key];
      const retained = packing ? (prunePacked(packing, packed) as string[]) : packed;

      await save({ ...trip, packed: retained });
    },
    [packing, save, trip],
  );

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
    toggle,
    remove,
    select: setSelectedId,
    refresh,
  };
}
