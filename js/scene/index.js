/**
 * Le moteur : caméra, boucle de rendu, régulation de qualité, éclairs.
 *
 * Il ne connaît que des SkyMood. Aucun code WMO, aucune température n'arrive
 * jusqu'ici — sky.js a déjà tout traduit en paramètres d'ambiance.
 *
 * Ce module est une amélioration progressive : si son import échoue, ou si
 * WebGL manque, main.js s'en passe et la page reste parfaitement lisible.
 */

import * as THREE from 'three';

import { blendMoods } from '../sky.js';
import { createSkyDome } from './sky-dome.js';
import { createClouds } from './clouds.js';
import { createPrecipitation } from './precipitation.js';
import { nextTier, settingsFor, SAMPLE_SIZE } from './quality.js';

/**
 * Palier de départ, deviné avant d'avoir mesuré quoi que ce soit. Attaquer une
 * petite machine à pleine qualité gâcherait justement les premières secondes,
 * celles où l'on juge.
 */
function guessInitialTier() {
  const coeurs = navigator.hardwareConcurrency ?? 4;
  const surface = window.innerWidth * window.innerHeight;

  if (coeurs <= 4 || surface > 4_000_000) return 'medium';
  return 'high';
}

/** Éclairs : un groupe de deux ou trois flashs, toutes les 5 à 14 secondes. */
function createLightning() {
  let next = 3 + Math.random() * 6;
  let flash = 0;
  let bursts = 0;

  return {
    tick(time, delta, active) {
      flash = Math.max(0, flash - delta * 6.5);

      if (!active) return flash;

      if (time > next) {
        flash = 0.55 + Math.random() * 0.4;
        bursts -= 1;

        if (bursts > 0) {
          next = time + 0.06 + Math.random() * 0.12; // la salve
        } else {
          bursts = 1 + Math.round(Math.random() * 2);
          next = time + 5 + Math.random() * 9; // le calme entre deux orages
        }
      }

      return flash;
    },
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {object|null} l'API de la scène, ou null si WebGL est indisponible
 */
export function createScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let tier = guessInitialTier();
  let settings = settingsFor(tier);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
  camera.position.set(0, 0, 0);
  // Légèrement relevée : l'horizon tombe au tiers bas, comme dans un paysage.
  camera.lookAt(0, 9, -100);

  const scene = new THREE.Scene();

  const dome = createSkyDome(settings);
  const clouds = createClouds(settingsFor('high'), camera); // toutes les couches, on en masquera
  const precipitation = createPrecipitation();
  const lightning = createLightning();

  scene.add(dome.mesh, ...clouds.meshes, precipitation.mesh);

  let moodA = null;
  let moodB = null;
  let progress = 0;
  let current = null;

  let running = false;
  let frameId = null;
  const clock = new THREE.Clock();
  let elapsed = 0;
  const frameTimes = [];

  function applyQuality() {
    settings = settingsFor(tier);

    const ratio = Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio);
    renderer.setPixelRatio(ratio);
    precipitation.setPixelRatio(ratio);

    clouds.meshes.forEach((mesh, i) => {
      mesh.visible = i >= clouds.meshes.length - settings.cloudLayers;
    });

    if (current) precipitation.setDrawRange(current.precipitation.intensity, settings.particleScale);
  }

  function applyMood(mood) {
    current = mood;
    dome.apply(mood);
    clouds.apply(mood);
    precipitation.apply(mood);
    precipitation.setDrawRange(mood.precipitation.intensity, settings.particleScale);
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);

    // En mouvement réduit aucune boucle ne tourne : sans ce repeint, tourner
    // son téléphone laisserait un ciel noir ou étiré.
    if (reduced) renderOnce();
  }

  function renderOnce() {
    dome.tick(elapsed, 0);
    clouds.tick(elapsed);
    precipitation.tick(elapsed);
    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    frameId = requestAnimationFrame(loop);

    const delta = Math.min(clock.getDelta(), 0.1);
    elapsed += delta;

    // Régulation : on observe, et on ne descend jamais que dans un sens.
    if (tier !== 'low') {
      frameTimes.push(delta * 1000);
      if (frameTimes.length > SAMPLE_SIZE * 2) frameTimes.shift();

      const suivant = nextTier(tier, frameTimes);
      if (suivant !== tier) {
        tier = suivant;
        applyQuality();
        frameTimes.length = 0;
      }
    }

    const flash = lightning.tick(elapsed, delta, current?.lightning ?? false);

    dome.tick(elapsed, flash);
    clouds.tick(elapsed);
    precipitation.tick(elapsed);
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    clock.getDelta();
    frameId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  }

  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }

    // Une même raison qu'au redimensionnement : sans boucle, le contexte WebGL
    // peut revenir vide après un passage en arrière-plan.
    if (reduced) renderOnce();
    else start();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', resize);

  applyQuality();
  resize();

  return {
    /** Les deux extrêmes entre lesquels le défilement fera la navette. */
    setMoods(today, tomorrow) {
      moodA = today;
      moodB = tomorrow;
      applyMood(blendMoods(moodA, moodB, progress));
      if (reduced) renderOnce();
    },

    /**
     * Progression du défilement, de 0 (aujourd'hui) à 1 (demain).
     * C'est la main de l'utilisateur qui transforme le ciel.
     */
    setProgress(t) {
      progress = t;
      if (!moodA || !moodB) return;

      applyMood(blendMoods(moodA, moodB, progress));
      // En mouvement réduit, aucune boucle ne tourne : on redessine à la main.
      if (reduced) renderOnce();
    },

    /** La couleur d'encre du moment, pour que le texte suive le ciel. */
    inkColor: () => current?.ink ?? null,

    start,
    stop,
    resize,

    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      dome.dispose();
      clouds.dispose();
      precipitation.dispose();
      renderer.dispose();
    },
  };
}
