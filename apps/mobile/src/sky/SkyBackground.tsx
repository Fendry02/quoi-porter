/**
 * Le ciel derrière tout le reste.
 *
 * Amélioration progressive, comme sur le web : si le shader ne compile pas sur
 * cet appareil, on retombe sur un aplat tiré de la même ambiance et l'écran
 * reste parfaitement lisible. Un ciel manquant ne doit jamais coûter la tenue
 * du jour.
 */

import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';

import { SKY_SHADER } from './sky-shader';
import { useSkyUniforms, type SkyState } from './use-sky-mood';

/**
 * Compilé une seule fois. `Make` rend `null` sur erreur de compilation, et on
 * se garde d'une exception au cas où Skia ne serait pas disponible du tout.
 */
const source = (() => {
  try {
    return Skia.RuntimeEffect.Make(SKY_SHADER);
  } catch {
    return null;
  }
})();

export function SkyBackground({
  state,
  width,
  height,
}: {
  state: SkyState;
  width: number;
  height: number;
}) {
  const uniforms = useSkyUniforms(state, width, height);

  if (!source) {
    return (
      <View
        accessible={false}
        style={[StyleSheet.absoluteFill, { backgroundColor: state.horizon }]}
      />
    );
  }

  return (
    <Canvas accessible={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={source} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
