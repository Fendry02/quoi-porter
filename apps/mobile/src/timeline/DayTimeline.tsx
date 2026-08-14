/**
 * Le déroulé de la journée.
 *
 * « 31 °C mais un peu de pluie » ne veut rien dire tant qu'on ne sait pas quand
 * tombe l'averse. La géométrie vient de `js/timeline.js`, le module partagé
 * avec le web : la courbe décrit donc exactement la même fenêtre horaire que
 * les phrases affichées au-dessus.
 *
 * Ce composant ne fait que la dessiner.
 */

import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { buildTimeline, VIEW } from '@/core/timeline';
import type { DayWeather, TimelineGeometry } from '@/lib/types';

const HEIGHT = 132;
const CURVE_MS = 900;
const BARS_MS = 520;

/** En dessous, une averse ne mérite pas d'être annoncée à voix haute. */
const SPOKEN_RAIN = 40;

/** Met la géométrie normalisée à l'échelle du composant, stroke compris. */
function scaledPath(d: string, scaleX: number, scaleY: number) {
  const path = Skia.Path.MakeFromSVGString(d);
  if (!path) return null;

  const matrix = Skia.Matrix();
  matrix.scale(scaleX, scaleY);
  path.transform(matrix);

  return path;
}

/**
 * Ce que VoiceOver doit entendre : un graphique muet ne dit rien, et le produit
 * tient à ce que le conseil reste écrit.
 */
function summarize(geo: TimelineGeometry): string {
  const { min, max } = geo.range;
  const base = `Déroulé de la journée. Ressenti de ${Math.round(min)} à ${Math.round(max)} degrés, maximum de ${geo.peak.label} vers ${geo.peak.hour} heures.`;

  const wet = geo.bars.filter((bar) => bar.probability >= SPOKEN_RAIN);
  if (wet.length === 0) return `${base} Pas de pluie notable.`;

  const from = wet[0].hour;
  const to = wet[wet.length - 1].hour;
  const when = from === to ? `vers ${from} heures` : `de ${from} à ${to} heures`;

  return `${base} Pluie probable ${when}.`;
}

export function DayTimeline({
  weather,
  at,
  ink,
  width,
}: {
  weather: DayWeather;
  at: Date;
  ink: string;
  width: number;
}) {
  const geo = useMemo(() => buildTimeline(weather, at), [weather, at]);

  const curveProgress = useSharedValue(0);
  const barsProgress = useSharedValue(0);

  // Le tracé se redessine à chaque jour choisi : c'est ce qui fait sentir que
  // l'on vient de changer de journée.
  useEffect(() => {
    if (!geo) return;

    curveProgress.value = 0;
    barsProgress.value = 0;
    curveProgress.value = withTiming(1, { duration: CURVE_MS });
    barsProgress.value = withTiming(1, { duration: BARS_MS });
  }, [geo, curveProgress, barsProgress]);

  const scaleX = width / VIEW.width;
  const scaleY = HEIGHT / VIEW.height;

  const paths = useMemo(() => {
    if (!geo) return null;

    return {
      curve: scaledPath(geo.curve, scaleX, scaleY),
      area: scaledPath(geo.area, scaleX, scaleY),
      band: geo.band ? scaledPath(geo.band, scaleX, scaleY) : null,
    };
  }, [geo, scaleX, scaleY]);

  // Les barres poussent depuis le bas du repère, pas depuis leur propre sommet.
  const barsTransform = useDerivedValue(() => [
    { translateY: HEIGHT },
    { scaleY: barsProgress.value },
    { translateY: -HEIGHT },
  ]);

  const areaOpacity = useDerivedValue(() => curveProgress.value * 0.14);

  if (!geo || !paths?.curve || !paths.area) return null;

  return (
    <View accessibilityLabel={summarize(geo)} accessible style={styles.wrapper}>
      <Canvas style={{ height: HEIGHT, width }}>
        {/* La bande d'incertitude d'abord : elle porte tout le reste. */}
        {paths.band ? <Path color={ink} opacity={0.1} path={paths.band} /> : null}

        <Group opacity={areaOpacity}>
          <Path color={ink} path={paths.area} />
        </Group>

        <Group transform={barsTransform}>
          {geo.bars.map((bar) => (
            <Rect
              color="#3E7CB1"
              height={bar.height * scaleY}
              key={`${bar.hour}-${bar.x}`}
              opacity={0.28 + (bar.probability / 100) * 0.5}
              width={bar.width * scaleX}
              x={bar.x * scaleX}
              y={bar.y * scaleY}
            />
          ))}
        </Group>

        <Path
          color={ink}
          end={curveProgress}
          path={paths.curve}
          strokeCap="round"
          strokeJoin="round"
          strokeWidth={2.5}
          style="stroke"
        />
      </Canvas>

      {/* Les heures restent du texte : elles suivent la taille système et
          l'accessibilité, ce que du texte dessiné dans le canevas ne ferait pas. */}
      <View style={[styles.axis, { width }]}>
        {geo.ticks
          .filter((tick) => tick.label !== null)
          .map((tick) => (
            <Text
              key={tick.hour}
              style={[
                styles.tick,
                { color: ink, left: tick.x * scaleX - 14 },
              ]}>
              {tick.label}
            </Text>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 4 },
  axis: { height: 18, marginTop: 6 },
  tick: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    opacity: 0.65,
    position: 'absolute',
    textAlign: 'center',
    width: 28,
  },
});
