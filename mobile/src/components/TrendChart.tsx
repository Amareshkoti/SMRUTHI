import React from 'react';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { c, font } from '../theme';
import { chartGeom } from '../chartGeom';
import { REFS, THRESHOLDS, THR_SHORT, yearsToThreshold } from '../insightDisplay';
import type { Insight } from '../api';

/**
 * The full Signal-screen chart: printed-normal-range band, the clinical
 * threshold line, an area fill under the series, a dashed projection toward
 * the threshold when the trend is heading that way, and a cursor line for
 * whichever year is selected.
 */
export function SignalChart({ insight, selectedIndex }: { insight: Insight; selectedIndex: number }) {
  const threshold = THRESHOLDS[insight.analyte];
  const band = REFS[insight.analyte] ?? null;
  const thrLabel = THR_SHORT[insight.analyte] ?? '';
  const years = yearsToThreshold(insight.lastValue, insight.slopePerYear, threshold);
  const extraSpan = years !== null && years > 0 ? Math.min(1.6, years + 0.4) : 0;

  const values = insight.points.map((p) => p.value);
  const g = chartGeom(values, { threshold, band, extraSpan });

  const i = Math.min(selectedIndex, g.pts.length - 1);
  const cursorX = g.pts[i]?.cx ?? g.pts[g.pts.length - 1]!.cx;

  let projPath: string | null = null;
  if (extraSpan > 0 && years !== null) {
    const last = g.pts[g.pts.length - 1]!;
    const projX = g.X(values.length - 1 + years);
    projPath = `M ${last.cx.toFixed(1)} ${last.cy.toFixed(1)} L ${projX.toFixed(1)} ${g.thrY.toFixed(1)}`;
  }

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

      {threshold !== undefined ? (
        <>
          <Line x1={0} y1={g.thrY} x2={g.w} y2={g.thrY} stroke={c.rose} strokeWidth={1} strokeDasharray="4 5" />
          <SvgText x={g.w - 16} y={g.thrY - 8} fontSize={10} fontFamily={font.body} fill={c.rose} textAnchor="end">
            {thrLabel}
          </SvgText>
        </>
      ) : null}

      <Path d={g.area} fill="url(#smrFill)" />

      {projPath ? <Path d={projPath} stroke={c.rose} strokeWidth={1.5} strokeDasharray="2 5" fill="none" opacity={0.8} /> : null}

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
