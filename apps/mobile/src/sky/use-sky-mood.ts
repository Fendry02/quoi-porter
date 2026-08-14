/**
 * Le pont entre `js/sky.js` et le shader.
 *
 * `blendMoods()` est du JavaScript pur : l'appeler à chaque image ferait
 * travailler le fil JS soixante fois par seconde pendant toute la transition.
 * On ne s'en sert donc que pour les deux extrémités, et l'interpolation se fait
 * dans un worklet, sur le fil d'animation. Les deux règles discrètes de
 * `blendMoods()` sont reproduites telles quelles : le type de précipitation
 * bascule à mi-parcours, et un orage à l'une des deux extrémités peut éclater
 * pendant toute la traversée.
 */

import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { moodFor } from '@/core/sky';
import type { DayWeather, SkyMood } from '@/lib/types';
import type { Motion } from '@/motion/use-motion';

/** Durée de la bascule d'un jour à l'autre. */
const BLEND_MS = 650;

type Rgb = [number, number, number];

/** Un mood réduit à des nombres : tout ce qu'un worklet sait interpoler. */
export type MoodUniforms = {
  zenith: Rgb;
  horizon: Rgb;
  sunHeight: number;
  sunIntensity: number;
  starDensity: number;
  cloudCover: number;
  cloudSpeed: number;
  turbulence: number;
  haze: number;
  wind: number;
  heat: number;
  /**
   * Discrète elle aussi, mais pas pour la même raison que le type de
   * précipitation : interpoler 0,98 vers 0,01 ferait remonter la lune tout un
   * cycle à l'envers pendant la traversée.
   */
  moonPhase: number;
  precipIntensity: number;
  /** 0 = pluie, 1 = neige. Discret : il n'existe pas de demi-flocon. */
  precipIsSnow: number;
  lightning: number;
};

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const NEUTRAL: MoodUniforms = {
  zenith: hexToRgb('#4a90c4'),
  horizon: hexToRgb('#cfe4ef'),
  sunHeight: 0.4,
  sunIntensity: 0.4,
  starDensity: 0,
  cloudCover: 0.3,
  cloudSpeed: 0.3,
  turbulence: 0.1,
  haze: 0.15,
  wind: 0,
  heat: 0,
  moonPhase: 0.5,
  precipIntensity: 0,
  precipIsSnow: 0,
  lightning: 0,
};

export function toUniforms(mood: SkyMood): MoodUniforms {
  return {
    zenith: hexToRgb(mood.zenith),
    horizon: hexToRgb(mood.horizon),
    sunHeight: mood.sunHeight,
    sunIntensity: mood.sunIntensity,
    starDensity: mood.starDensity,
    cloudCover: mood.cloudCover,
    cloudSpeed: mood.cloudSpeed,
    turbulence: mood.turbulence,
    haze: mood.haze,
    wind: mood.wind,
    heat: mood.heat,
    moonPhase: mood.moonPhase,
    precipIntensity: mood.precipitation.intensity,
    precipIsSnow: mood.precipitation.type === 'snow' ? 1 : 0,
    lightning: mood.lightning ? 1 : 0,
  };
}

function lerp(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}

function lerp3(a: Rgb, b: Rgb, t: number): Rgb {
  'worklet';
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** L'état visuel exact à cet instant, pour repartir de là sans à-coup. */
function snapshot(a: MoodUniforms, b: MoodUniforms, t: number): MoodUniforms {
  return {
    zenith: lerp3(a.zenith, b.zenith, t),
    horizon: lerp3(a.horizon, b.horizon, t),
    sunHeight: lerp(a.sunHeight, b.sunHeight, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    starDensity: lerp(a.starDensity, b.starDensity, t),
    cloudCover: lerp(a.cloudCover, b.cloudCover, t),
    cloudSpeed: lerp(a.cloudSpeed, b.cloudSpeed, t),
    turbulence: lerp(a.turbulence, b.turbulence, t),
    haze: lerp(a.haze, b.haze, t),
    wind: lerp(a.wind, b.wind, t),
    heat: lerp(a.heat, b.heat, t),
    moonPhase: t < 0.5 ? a.moonPhase : b.moonPhase,
    precipIntensity: lerp(a.precipIntensity, b.precipIntensity, t),
    precipIsSnow: t < 0.5 ? a.precipIsSnow : b.precipIsSnow,
    lightning: Math.max(a.lightning, b.lightning),
  };
}

export type SkyState = {
  from: SharedValue<MoodUniforms>;
  to: SharedValue<MoodUniforms>;
  progress: SharedValue<number>;
  time: SharedValue<number>;
  flash: SharedValue<number>;
  /**
   * Où l'on en est du défilement, de 0 à 1. L'écran l'alimente, le ciel s'en
   * sert pour décaler ses couches à des vitesses différentes.
   */
  scroll: SharedValue<number>;
  /** Ce qu'on a tiré au-delà du haut de page, de 0 à 1 : le jour se lève. */
  dawn: SharedValue<number>;
  /** 1 quand le mouvement est permis, 0 sinon. */
  allowed: SharedValue<number>;
  /** L'encre lisible sur le ciel courant, pour que le texte suive. */
  ink: string;
  /** Repli uni, si le shader ne compile pas sur cet appareil. */
  horizon: string;
  /**
   * Le haut du dôme. Avec `horizon`, il encadre le dégradé : de quoi calculer
   * le voile qui garantit la lisibilité sur toute la hauteur de l'écran, sans
   * avoir à échantillonner le rendu.
   */
  zenith: string;
};

/**
 * @param weather le jour affiché, ou `undefined` tant que rien n'est chargé
 * @param at l'instant représenté
 * @param motion le réglage « mouvement réduit », qui coupe la boucle d'images
 */
export function useSkyMood(weather: DayWeather | undefined, at: Date, motion: Motion): SkyState {
  const mood = useMemo(() => (weather ? moodFor(weather, at) : null), [weather, at]);
  const uniforms = useMemo(() => (mood ? toUniforms(mood) : NEUTRAL), [mood]);

  const from = useSharedValue<MoodUniforms>(uniforms);
  const to = useSharedValue<MoodUniforms>(uniforms);
  const progress = useSharedValue(1);

  const time = useSharedValue(0);
  const flash = useSharedValue(0);
  const nextStrike = useSharedValue(3);
  const bursts = useSharedValue(0);

  const scroll = useSharedValue(0);
  const dawn = useSharedValue(0);

  // Première ambiance : on se pose dessus, sans transition depuis un ciel qui
  // n'a jamais été montré.
  const settled = useRef(false);

  useEffect(() => {
    if (!mood) return;

    if (!settled.current) {
      settled.current = true;
      from.value = uniforms;
      to.value = uniforms;
      progress.value = 1;
      return;
    }

    from.value = snapshot(from.value, to.value, progress.value);
    to.value = uniforms;
    progress.value = 0;
    progress.value = withTiming(1, { duration: BLEND_MS });
  }, [mood, uniforms, from, to, progress]);

  // Le temps et les éclairs. Une seule boucle, sur le fil d'animation, coupée
  // dès que l'app passe en arrière-plan ou que le mouvement réduit est demandé.
  const frame = useFrameCallback((info) => {
    'worklet';
    const delta = Math.min(info.timeSincePreviousFrame ?? 16, 100) / 1000;
    time.value += delta;

    flash.value = Math.max(0, flash.value - delta * 6.5);

    const active = Math.max(from.value.lightning, to.value.lightning) > 0.5;
    if (!active) return;

    if (time.value > nextStrike.value) {
      flash.value = 0.55 + Math.random() * 0.4;
      bursts.value -= 1;

      if (bursts.value > 0) {
        nextStrike.value = time.value + 0.06 + Math.random() * 0.12; // la salve
      } else {
        bursts.value = 1 + Math.round(Math.random() * 2);
        nextStrike.value = time.value + 5 + Math.random() * 9; // le calme
      }
    }
  }, false);

  const reduced = motion.reduced;

  useEffect(() => {
    let foreground = AppState.currentState === 'active';

    const apply = () => frame.setActive(foreground && !reduced);
    apply();

    const app = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      apply();
    });

    return () => {
      app.remove();
      frame.setActive(false);
    };
  }, [frame, reduced]);

  return {
    from,
    to,
    progress,
    time,
    flash,
    scroll,
    dawn,
    allowed: motion.allowed,
    ink: mood?.ink ?? '#12293d',
    horizon: mood?.horizon ?? '#cfe4ef',
    zenith: mood?.zenith ?? '#4a90c4',
  };
}

/** Les uniformes du shader, recalculés sur le fil d'animation. */
export function useSkyUniforms(state: SkyState, width: number, height: number) {
  return useDerivedValue(() => {
    const t = state.progress.value;
    const a = state.from.value;
    const b = state.to.value;

    // La parallaxe et le lever du jour sont du mouvement piloté au doigt : le
    // mouvement réduit les annule ici, en un seul endroit, plutôt que dans
    // chaque gestionnaire de défilement.
    const moving = state.allowed.value;

    return {
      u_resolution: [width, height],
      u_time: state.time.value,
      u_zenith: lerp3(a.zenith, b.zenith, t),
      u_horizon: lerp3(a.horizon, b.horizon, t),
      u_sunHeight: lerp(a.sunHeight, b.sunHeight, t),
      u_sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
      u_starDensity: lerp(a.starDensity, b.starDensity, t),
      u_cloudCover: lerp(a.cloudCover, b.cloudCover, t),
      u_cloudSpeed: lerp(a.cloudSpeed, b.cloudSpeed, t),
      u_turbulence: lerp(a.turbulence, b.turbulence, t),
      u_haze: lerp(a.haze, b.haze, t),
      u_wind: lerp(a.wind, b.wind, t),
      u_heat: lerp(a.heat, b.heat, t),
      u_moonPhase: t < 0.5 ? a.moonPhase : b.moonPhase,
      u_precipIntensity: lerp(a.precipIntensity, b.precipIntensity, t),
      u_precipIsSnow: t < 0.5 ? a.precipIsSnow : b.precipIsSnow,
      u_flash: state.flash.value,
      u_scroll: state.scroll.value * moving,
      u_dawn: state.dawn.value * moving,
    };
  }, [width, height]);
}
