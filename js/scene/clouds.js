/**
 * Les nuages : plusieurs plans à des profondeurs différentes, dérivant chacun
 * à sa vitesse.
 *
 * C'est la parallaxe qui crée la profondeur — les couches proches défilent
 * vite et floues, les lointaines lentement et nettes. Une seule couche, aussi
 * belle soit-elle, resterait un fond plat.
 *
 * La forme vient d'un bruit fractal calculé dans le shader : aucune texture à
 * charger, et une résolution infinie.
 */

import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec3 uColor;
  uniform float uCover;      // 0 ciel nu → 1 bouché
  uniform float uOpacity;    // propre à la couche, décroît avec la distance
  uniform float uScale;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uTurbulence;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);   // lissage cubique

    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  /**
   * Bruit fractal. Cinq octaves, mais dont l'amplitude décroît vite : une
   * grande masse porte du détail, elle n'en est pas faite. Décroître trop
   * lentement donnerait de la mousse plutôt que des nuages.
   */
  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.55;
    float somme = 0.0;

    for (int i = 0; i < 5; i++) {
      total += noise(p) * amplitude;
      somme += amplitude;
      p *= 2.17;
      amplitude *= 0.42;
    }

    return total / somme;
  }

  void main() {
    // Le plan fait 3,2 fois plus large que haut. On ne corrige l'aspect qu'à
    // moitié : de vraies masses nuageuses sont étirées par le vent, un bruit
    // parfaitement isotrope donne des taches rondes sans direction.
    vec2 p = vUv * vec2(uScale * 1.9, uScale);
    p.x -= uTime * uSpeed;

    // Le vent ne fait pas que pousser les nuages, il les déforme : on décale
    // le champ par lui-même, ce qui les étire et les tord.
    vec2 warp = vec2(fbm(p * 0.5 + 11.0), fbm(p * 0.5 + 27.0)) - 0.5;
    float density = fbm(p + warp * uTurbulence * 1.6);

    // uCover abaisse le seuil : plus le ciel est couvert, plus de bruit passe.
    // Il reste haut, car les couches s'empilent : une couverture qui paraîtrait
    // juste sur une seule bouche tout le ciel à cinq.
    //
    // La rampe est large et la puissance adoucit encore : un seuil serré
    // découperait des filaments, là où un nuage a des bords qui se dissipent.
    float edge = mix(0.70, 0.38, uCover);
    float mask = pow(smoothstep(edge, edge + 0.24, density), 1.5);

    // Fondu vers les bords du plan, pour qu'aucune arête ne se voie.
    vec2 d = abs(vUv - 0.5) * 2.0;
    float vignette = (1.0 - smoothstep(0.55, 1.0, d.x)) * (1.0 - smoothstep(0.25, 0.95, d.y));

    float alpha = mask * uOpacity * vignette;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

/** Profondeurs des couches, de la plus lointaine à la plus proche. */
const DEPTHS = [-260, -190, -140, -100, -70];

/**
 * @param {{cloudLayers: number}} settings réglages du palier de qualité
 * @param {THREE.PerspectiveCamera} camera sert à dimensionner les plans
 */
export function createClouds(settings, camera) {
  const layers = [];
  const count = Math.min(settings.cloudLayers, DEPTHS.length);

  for (let i = 0; i < count; i++) {
    const depth = DEPTHS[i];
    const distance = Math.abs(depth);

    // On dimensionne chaque plan pour qu'il couvre largement le champ de vision
    // à sa profondeur, quel que soit le format de la fenêtre.
    const height = 2 * distance * Math.tan((camera.fov * Math.PI) / 360) * 2.2;
    const width = height * 3.2;

    const uniforms = {
      uColor: { value: new THREE.Color('#ffffff') },
      uCover: { value: 0.3 },
      // Les couches lointaines sont plus discrètes : c'est ce qui donne
      // l'impression d'atmosphère entre elles.
      uOpacity: { value: 0.18 + (i / Math.max(1, count - 1)) * 0.3 },
      uScale: { value: 5.0 + i * 3.0 },
      uSpeed: { value: 0.012 + i * 0.016 },
      uTurbulence: { value: 0.3 },
      uTime: { value: 0 },
    };

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, distance * 0.12, depth);
    mesh.renderOrder = 1 + i;
    mesh.frustumCulled = false;

    layers.push({ mesh, uniforms, geometry, material, baseOpacity: uniforms.uOpacity.value });
  }

  return {
    meshes: layers.map((l) => l.mesh),

    apply(mood) {
      // Les nuages ne sont pas blancs : ils prennent la lumière du moment.
      // Au crépuscule ils rosissent, la nuit ils s'éteignent presque.
      const lit = new THREE.Color(mood.horizon).lerp(
        new THREE.Color('#ffffff'),
        0.25 + mood.sunIntensity * 0.6,
      );

      for (const layer of layers) {
        layer.uniforms.uColor.value.copy(lit);
        layer.uniforms.uCover.value = mood.cloudCover;
        layer.uniforms.uSpeed.value = (0.012 + layers.indexOf(layer) * 0.016) * (0.4 + mood.cloudSpeed * 2.2);
        layer.uniforms.uTurbulence.value = mood.turbulence;
        layer.uniforms.uOpacity.value = layer.baseOpacity * (0.35 + mood.cloudCover * 0.9);
      }
    },

    tick(time) {
      for (const layer of layers) layer.uniforms.uTime.value = time;
    },

    dispose() {
      for (const layer of layers) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
    },
  };
}
