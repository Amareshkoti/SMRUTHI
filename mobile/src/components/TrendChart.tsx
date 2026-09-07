import React from 'react';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { c, font } from '../theme';
import { chartGeom } from '../chartGeom';
import type { Insight } from '../api';

/**
 * The full Signal-screen chart. Reference bands come from the uploaded
 * reports; the chart does not invent universal thresholds or future values.
 */
export function SignalChart({ insight, selectedIndex }: { insight: Insight; selectedIndex: number }) {
  const values = insight.points.map((p) => p.value);
  const latest = insight.points[insight.points.length - 1]!;
  const band: [number | null, number | null] | null = latest.refLow !== null || latest.refHigh !== null
    ? [latest.refLow, latest.refHigh]
    : null;
  const g = chartGeom(values, { band });

  const i = Math.min(selectedIndex, g.pts.length - 1);
  const cursorX = g.pts[i]?.cx ?? g.pts[g.pts.length - 1]!.cx;

  return (
    <Svg width={g.w} height={g.h}>
      <Defs>
        <LinearGradient id="smrFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={c.gold} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={c.gold} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {g.band ? (
        <>
          <Rect x={g.band.x} y={g.band.y} width={g.band.w} height={g.band.h} fill={c.mint} opacity={0.07} />
          <SvgText x={g.band.x + 26} y={g.band.y + g.band.h - 8} fontSize={10} fontFamily={font.body} fill={c.mint} opacity={0.85}>
            printed normal range
          </SvgText>
        </>
      ) : null}

      <Path d={g.area} fill="url(#smrFill)" />

      <Path d={g.path} stroke={c.gold} strokeWidth={2} fill="none" strokeLinejoin="round" />

      {g.pts.map((p, k) => (
        <Circle
          key={k}
          cx={p.cx}
          cy={p.cy}
          r={k === i ? 6 : 4}
          fill={c.ink}
          stroke={k === i ? c.gold : 'rgba(216,178,107,.45)'}
          strokeWidth={2}
        />
      ))}

      <Line x1={cursorX} y1={18} x2={cursorX} y2={g.base + 8} stroke="rgba(255,255,255,.16)" strokeWidth={1} />
    </Svg>
  );
}
