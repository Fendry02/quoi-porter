/**
 * Le ciel, en un seul shader.
 *
 * Le web empile des maillages Three.js — un dôme, des plans de nuages, un
 * système de particules. Sur téléphone, tout tient dans un seul passage de
 * fragment : une passe plein écran coûte moins cher que la géométrie, et la
 * batterie d'un geste matinal n'est pas extensible.
 *
 * Comme sur le web, ce module ne connaît que des SkyMood. Aucun code WMO,
 * aucune température n'arrive jusqu'ici : `js/sky.js` a déjà tout traduit.
 */

export const SKY_SHADER = `
uniform float2 u_resolution;
uniform float  u_time;

uniform float3 u_zenith;
uniform float3 u_horizon;

uniform float u_sunHeight;
uniform float u_sunIntensity;
uniform float u_starDensity;
uniform float u_cloudCover;
uniform float u_cloudSpeed;
uniform float u_turbulence;
uniform float u_haze;
uniform float u_precipIntensity;
uniform float u_precipIsSnow;
uniform float u_flash;

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + float2(1.0, 0.0));
  float c = hash21(i + float2(0.0, 1.0));
  float d = hash21(i + float2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Quatre octaves : au-delà, le gain visuel ne paie plus son coût. */
float fbm(float2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

/** Une nappe de pluie : des colonnes qui défilent, chacune avec sa phase. */
float rainLayer(float2 uv, float scale, float speed, float seedOffset) {
  float2 p = float2(uv.x * scale, uv.y);
  p.x += uv.y * 0.25;

  float column = floor(p.x);
  float phase = hash21(float2(column, seedOffset));

  float y = fract(p.y * 6.0 - u_time * speed - phase * 10.0);
  float x = fract(p.x);

  return smoothstep(0.06, 0.0, abs(x - 0.5)) * smoothstep(0.55, 0.0, y);
}

/** La neige tombe moins vite et dérive de côté. */
float snowLayer(float2 uv, float scale, float speed, float seedOffset) {
  float2 p = uv * scale;
  p.y -= u_time * speed * 0.15;
  p.x += sin(u_time * 0.6 + p.y * 1.4) * 0.25 + seedOffset;

  float2 id = floor(p);
  float2 f = fract(p) - 0.5;

  float seed = hash21(id);
  float radius = 0.10 + seed * 0.10;

  return smoothstep(radius, radius * 0.3, length(f)) * step(0.62, seed);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_resolution;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);

  // 1. Le dôme. L'exposant relève l'horizon au tiers bas, comme un paysage.
  float3 color = mix(u_zenith, u_horizon, pow(uv.y, 0.85));

  // 2. L'astre. Sa hauteur suit le soleil réel du lieu ; les nuages l'ont déjà
  //    voilé en amont, dans sunIntensity.
  float2 sunPos = float2(0.68, 0.74 - u_sunHeight * 0.58);
  float sunDist = distance(float2(uv.x * aspect, uv.y), float2(sunPos.x * aspect, sunPos.y));
  color += float3(1.0, 0.93, 0.78) * exp(-sunDist * 4.2) * u_sunIntensity * 0.9;

  // 3. Les étoiles ne sortent que d'un ciel dégagé, et jamais près du sol.
  if (u_starDensity > 0.01) {
    float2 grid = fragCoord / 3.0;
    float seed = hash21(floor(grid));
    float twinkle = 0.6 + 0.4 * sin(u_time * 2.0 + seed * 60.0);
    float star = smoothstep(0.9965, 1.0, seed) * twinkle;
    color += float3(1.0) * star * u_starDensity * (1.0 - uv.y);
  }

  // 4. Les nuages : deux nappes déformées par le vent, à des vitesses
  //    différentes, pour que le ciel ne défile pas d'un bloc.
  float drift = u_time * (0.02 + u_cloudSpeed * 0.06);
  float2 warp = float2(fbm(uv * 3.0 + drift * 0.5), fbm(uv * 3.0 - drift * 0.4));
  float2 cp = uv * float2(2.2, 3.4) + warp * (0.12 + u_turbulence * 0.35);

  float clouds = mix(fbm(cp + float2(drift, 0.0)), fbm(cp * 1.7 + float2(drift * 1.9, 0.0)), 0.45);

  // La couverture décide du seuil : un ciel dégagé n'en laisse passer aucun.
  float edge = mix(0.85, 0.18, u_cloudCover);
  float mask = smoothstep(edge, edge + 0.28, clouds) * smoothstep(1.0, 0.45, uv.y);

  float3 lit = mix(float3(0.32, 0.35, 0.40), float3(1.0, 0.99, 0.96),
                   clamp(u_sunIntensity + 0.35, 0.0, 1.0));
  color = mix(color, lit, mask * (0.35 + 0.5 * u_cloudCover));

  // 5. La brume monte du bas et mange l'horizon.
  color = mix(color, u_horizon, u_haze * smoothstep(0.25, 1.0, uv.y) * 0.75);

  // 6. Ce qui tombe. Deux nappes, l'une derrière l'autre.
  if (u_precipIntensity > 0.01) {
    if (u_precipIsSnow > 0.5) {
      float flakes = snowLayer(uv, 14.0, 1.0, 0.0) + snowLayer(uv, 9.0, 0.65, 3.7);
      color = mix(color, float3(1.0), clamp(flakes * u_precipIntensity * 0.9, 0.0, 1.0));
    } else {
      float drops = rainLayer(uv, 60.0, 2.6, 7.0) + rainLayer(uv, 38.0, 1.9, 19.0);
      color = mix(color, float3(0.85, 0.90, 0.95), clamp(drops * u_precipIntensity * 0.7, 0.0, 1.0));
    }
  }

  // 7. L'éclair blanchit tout le ciel, un instant.
  color += float3(0.90, 0.93, 1.0) * u_flash * 0.55;

  return half4(half3(clamp(color, 0.0, 1.0)), 1.0);
}
`;
