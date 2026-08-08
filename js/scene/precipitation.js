/**
 * Pluie et neige.
 *
 * Un seul nuage de points, deux comportements. La perspective de la caméra
 * offre la profondeur gratuitement : les particules proches sont grandes et
 * rapides, les lointaines petites et lentes.
 *
 * Le déplacement est calculé dans le shader à partir du temps, avec un modulo
 * pour reboucler. Le processeur n'a donc jamais à toucher aux positions.
 */

import * as THREE from 'three';

/** Volume dans lequel les particules tombent, autour de la caméra. */
const FIELD = { width: 80, height: 70, depth: 75, near: 9 };

const VERTEX = /* glsl */ `
  precision highp float;

  attribute float aSeed;    // 0 → 1, propre à chaque particule
  attribute float aSize;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uTilt;      // inclinaison due au vent
  uniform float uDrift;     // dérive latérale, la neige seule
  uniform float uPixelRatio;
  uniform float uHeight;
  uniform float uSizeScale;

  varying float vDepth;

  void main() {
    vec3 pos = position;

    // Chute rebouclée : chaque particule descend puis réapparaît en haut.
    float fall = uTime * uSpeed * (0.55 + aSeed * 0.9);
    pos.y = mod(pos.y - fall, uHeight) - uHeight * 0.5;

    // Le vent pousse tout le champ de côté ; la neige y ajoute son balancement.
    pos.x += uTilt * (uHeight * 0.5 - pos.y) * 0.35;
    pos.x += sin(uTime * (0.6 + aSeed) + aSeed * 42.0) * uDrift;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mv.z;

    // Taille en perspective : plus c'est près, plus c'est gros. Mais bornée
    // aux deux bouts — sans plancher sur la distance, une particule frôlant la
    // caméra devient une tache blanche de plusieurs centaines de pixels.
    float taille = aSize * uSizeScale * uPixelRatio * (320.0 / max(vDepth, 9.0));
    gl_PointSize = min(taille, 40.0 * uPixelRatio);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uStreak;   // 1 = trait de pluie, 0 = flocon rond

  varying float vDepth;

  void main() {
    vec2 c = gl_PointCoord - 0.5;

    // Un trait vertical fin pour la pluie, un disque doux pour la neige.
    // On écrase l'axe horizontal, ce qui étire la forme sans changer la
    // géométrie : le même nuage de points sert aux deux.
    float squash = mix(1.0, 7.0, uStreak);
    float d = length(vec2(c.x * squash, c.y));
    float alpha = smoothstep(0.5, mix(0.06, 0.24, uStreak), d);

    // Les particules lointaines s'effacent dans l'atmosphère.
    float distanceFade = 1.0 - smoothstep(35.0, 85.0, vDepth);

    float a = alpha * uOpacity * distanceFade;
    if (a < 0.01) discard;

    gl_FragColor = vec4(uColor, a);
  }
`;

const MAX_PARTICLES = 5000;

/**
 * On alloue toujours le maximum de particules — cent kilo-octets, négligeable —
 * et c'est la plage de dessin qui décide combien sont réellement rendues. Le
 * palier de qualité peut ainsi baisser sans jamais reconstruire la géométrie.
 */
export function createPrecipitation() {
  const count = MAX_PARTICLES;

  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * FIELD.width;
    positions[i * 3 + 1] = (Math.random() - 0.5) * FIELD.height;
    positions[i * 3 + 2] = -(FIELD.near + Math.random() * (FIELD.depth - FIELD.near));
    seeds[i] = Math.random();
    sizes[i] = 0.5 + Math.random() * 0.7;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 24 },
    uTilt: { value: 0 },
    uDrift: { value: 0 },
    uPixelRatio: { value: 1 },
    uHeight: { value: FIELD.height },
    uColor: { value: new THREE.Color('#ffffff') },
    uOpacity: { value: 0 },
    uStreak: { value: 1 },
    uSizeScale: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 20;
  points.frustumCulled = false;

  return {
    mesh: points,

    apply(mood) {
      const { type, intensity } = mood.precipitation;

      if (!type || intensity <= 0) {
        points.visible = false;
        uniforms.uOpacity.value = 0;
        return;
      }

      points.visible = true;
      const neige = type === 'snow';

      uniforms.uStreak.value = neige ? 0 : 1;
      // Une goutte doit laisser une traînée : le sprite est bien plus grand
      // que pour un flocon, et le shader l'écrase en un trait fin.
      uniforms.uSizeScale.value = neige ? 1.1 : 3.4;
      uniforms.uSpeed.value = neige ? 4.5 : 34;
      uniforms.uDrift.value = neige ? 1.6 + mood.turbulence * 3.2 : 0;
      // La pluie s'incline franchement sous les rafales ; la neige, plus légère,
      // se contente de dériver.
      uniforms.uTilt.value = neige ? mood.turbulence * 0.12 : mood.turbulence * 0.55;
      uniforms.uOpacity.value = (neige ? 0.85 : 0.5) * (0.35 + intensity * 0.65);

      // Une goutte capte la lumière du ciel : elle est toujours plus claire que
      // lui, jamais plus sombre. Prendre la couleur d'encre la rendait grise —
      // donc invisible — à mi-chemin entre un ciel clair et un ciel d'orage.
      uniforms.uColor.value
        .set(neige ? '#f4f7fb' : mood.horizon)
        .lerp(new THREE.Color('#ffffff'), neige ? 0.0 : 0.55);
    },

    /**
     * Le nombre de particules dessinées suit l'intensité de l'averse et le
     * palier de qualité, sans jamais toucher aux données.
     */
    setDrawRange(intensity, particleScale) {
      const part = Math.min(1, 0.25 + intensity) * particleScale;
      geometry.setDrawRange(0, Math.max(80, Math.round(count * part)));
    },

    setPixelRatio(ratio) {
      uniforms.uPixelRatio.value = ratio;
    },

    tick(time) {
      uniforms.uTime.value = time;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
