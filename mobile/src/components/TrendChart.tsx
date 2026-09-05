import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { c, font, type } from '../theme';
import type { Insight } from '../api';

/**
 * The thread from the timeline, turned on its side.
 *
 * Every point is drawn in ink, not in a warning colour, because every one of
 * these readings genuinely was normal on the day it was taken. The only red on
 * this chart is the clinical threshold line -- which the series is approaching
 * but has not crossed. That gap is the entire argument.
 */
export function TrendChart({ insight, threshold }: { insight: Insight; threshold?: number }) {
  const W = 320;
  const H = 190;
  const padL = 40;
  const padR = 16;
  const padT = 18;
  const padB = 34;

  const values = insight.points.map((p) => p.value);
  const candidates = threshold ? [...values, threshold] : values;
  const lo = Math.min(...candidates);
  const hi = Math.max(...candidates);
  const pad = (hi - lo) * 0.25 || 0.5;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const x = (i: number) =>
    padL + (i * (W - padL - padR)) / Math.max(1, insight.points.length - 1);
  const y = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * (H - padT - padB);

  const path = insight.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');

  return (
    <View>
      <Svg width={W} height={H}>
        {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
          <Line key={i} x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke={c.mist} strokeWidth={1} />
        ))}
        {[yMax, yMin].map((v, i) => (
          <SvgText
            key={i}
            x={padL - 8}
            y={y(v) + 4}
            fontSize={11}
            fill={c.inkFaint}
            textAnchor="end"
            fontFamily={font.body}
          >
            {v.toFixed(1)}
          </SvgText>
        ))}

        {threshold !== undefined && threshold <= yMax && (
          <>
            <Line
              x1={padL}
              y1={y(threshold)}
              x2={W - padR}
              y2={y(threshold)}
              stroke={c.kumkum}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <SvgText
              x={W - padR}
              y={y(threshold) - 7}
              fontSize={11}
              fill={c.kumkum}
              textAnchor="end"
              fontFamily={font.body}
            >
              {`danger line ${threshold}`}
            </SvgText>
          </>
        )}

        <Path d={path} stroke={c.ink} strokeWidth={2} fill="none" />

        {insight.points.map((p, i) => (
          <React.Fragment key={p.date}>
            <Circle cx={x(i)} cy={y(p.value)} r={5} fill={c.surface} stroke={c.ink} strokeWidth={2} />
            <SvgText
              x={x(i)}
              y={H - 14}
              fontSize={11}
              fill={c.inkFaint}
              textAnchor="middle"
              fontFamily={font.body}
            >
              {p.date.slice(0, 4)}
            </SvgText>
            <SvgText
              x={x(i)}
              y={y(p.value) - 12}
              fontSize={12}
              fill={c.ink}
              textAnchor="middle"
              fontFamily={font.bodyMedium}
            >
              {String(p.value)}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
      <Text style={styles.caption}>
        {insight.points.length} reports, {insight.points.map((p) => p.hospital).filter(Boolean).length}{' '}
        different labs. Each one read normal on its own day.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { ...type.small, marginTop: 4, marginLeft: 40 },
});
