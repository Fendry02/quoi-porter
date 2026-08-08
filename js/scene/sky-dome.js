/**
 * Le fond céleste : dégradé, astre, étoiles, brume et grain.
 *
 * C'est de loin la couche la plus importante — l'essentiel de l'ambiance vient
 * d'ici. Une sphère retournée autour de la caméra, peinte par un seul shader.
 *
 * Tout est procédural : ni image, ni texture à télécharger.
 */

import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    // Direction du regard vers ce point du dôme, indépendante de la position
    // de la caméra puisque celle-ci est au centre de la sphère.
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vDirection;

  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform float uSunHeight;     // -1 nuit noire → 1 plein midi
  uniform float uSunIntensity;  // 0 → 1, déjà atténué par les nuages
  uniform float uStarDensity;   // 0 → 1, déjà étouffé par les nuages
  uniform float uHaze;
  uniform float uFlash;         // éclair : montée brève de luminosité
  uniform float uTime;
  uniform float uGrain;

  // Bruit de valeur bon marché, suffisant pour des étoiles et du grain.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vDirection);

    // --- dégradé vertical -------------------------------------------------
    // Une courbe plutôt qu'une rampe : le ciel réel s'assombrit vite près du
    // zénith puis s'aplatit, une interpolation linéaire paraîtrait plate.
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    float t = pow(smoothstep(0.35, 1.0, h), 0.75);
    vec3 color = mix(uHorizon, uZenith, t);

    // --- brume ------------------------------------------------------------
    // Elle lève le bas du ciel et écrase le contraste, comme une vraie brume.
    float lowness = 1.0 - smoothstep(0.0, 0.55, h);
    color = mix(color, uHorizon * 1.08, uHaze * lowness * 0.85);

    // --- l'astre ----------------------------------------------------------
    // Il monte et descend avec la hauteur de soleil ; sous l'horizon, c'est la
    // lune qui prend le relais, plus petite et bien plus froide.
    float elevation = uSunHeight * 1.35;
    vec3 sunDir = normalize(vec3(0.42, elevation, -0.86));
    float toSun = max(dot(dir, sunDir), 0.0);

    if (uSunIntensity > 0.001) {
      float halo = pow(toSun, 5.0) * 0.55 + pow(toSun, 90.0) * 1.6;
      vec3 warm = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.72, 0.45), 1.0 - clamp(uSunHeight, 0.0, 1.0));
      color += warm * halo * uSunIntensity;
    }

    if (uSunHeight < 0.05) {
      vec3 moonDir = normalize(vec3(-0.55, 0.42, -0.72));
      float toMoon = max(dot(dir, moonDir), 0.0);
      float nightness = clamp(-uSunHeight * 2.0 + 0.1, 0.0, 1.0);
      float disc = smoothstep(0.9975, 0.9990, toMoon);
      float glow = pow(toMoon, 220.0) * 0.35;
      color += vec3(0.86, 0.90, 1.0) * (disc * 0.9 + glow) * nightness;
    }

    // --- étoiles ----------------------------------------------------------
    // Une grille de cellules, une étoile éventuelle par cellule. Seules les
    // plus brillantes survivent au seuil, ce qui évite un ciel en confettis.
    if (uStarDensity > 0.001) {
      vec3 cell = floor(dir * 190.0);
      float n = hash(cell);
      float star = smoothstep(0.9955, 1.0, n);
      float twinkle = 0.65 + 0.35 * sin(uTime * 2.1 + n * 63.0);
      float above = smoothstep(0.02, 0.28, h);
      color += vec3(0.92, 0.95, 1.0) * star * twinkle * above * uStarDensity;
    }

    // --- éclair -----------------------------------------------------------
    color += vec3(0.62, 0.66, 0.78) * uFlash;

    // --- grain ------------------------------------------------------------
    // Sans lui, un dégradé aussi doux montre des bandes sur un écran 8 bits.
    if (uGrain > 0.5) {
      float noise = hash(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
      color += noise * 0.014;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * @param {{grain: boolean}} settings réglages du palier de qualité
 * @returns {{mesh: THREE.Mesh, apply: (mood: object) => void, tick: (time: number, flash: number) => void, dispose: () => void}}
 */
export function createSkyDome(settings) {
  const uniforms = {
    uZenith: { value: new THREE.Color('#4a90c4') },
    uHorizon: { value: new THREE.Color('#cfe4ef') },
    uSunHeight: { value: 0.5 },
    uSunIntensity: { value: 0.5 },
    uStarDensity: { value: 0 },
    uHaze: { value: 0.2 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: settings.grain ? 1 : 0 },
  };

  const geometry = new THREE.SphereGeometry(400, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,

    apply(mood) {
      uniforms.uZenith.value.set(mood.zenith);
      uniforms.uHorizon.value.set(mood.horizon);
      uniforms.uSunHeight.value = mood.sunHeight;
      uniforms.uSunIntensity.value = mood.sunIntensity;
      uniforms.uStarDensity.value = mood.starDensity;
      uniforms.uHaze.value = mood.haze;
    },

    tick(time, flash) {
      uniforms.uTime.value = time;
      uniforms.uFlash.value = flash;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
