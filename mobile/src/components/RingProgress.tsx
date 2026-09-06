import React from 'react';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { c, font } from '../theme';

/** Circular countdown for the Home finding card: how soon at this rate. */
export function RingProgress({ years, size = 62, radius = 26, strokeWidth = 3 }: {
  years: number | null;
  size?: number;
  radius?: number;
  strokeWidth?: number;
}) {
  const circumference = 2 * Math.PI * radius;
  const prog = years === null ? 0 : Math.max(0.06, Math.min(1, 1 - years / 3));
  const offset = circumference * (1 - prog);
  const center = size / 2;
  const label = years === null ? '—' : `${years.toFixed(1)}y`;

  return (
    <Svg width={size} height={size}>
      <Circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={strokeWidth} />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={c.gold}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        rotation={-90}
        origin={`${center}, ${center}`}
      />
      <SvgText x={center} y={center + 4} fontSize={13} fontFamily={font.bodySemibold} fill={c.text} textAnchor="middle">
        {label}
      </SvgText>
    </Svg>
  );
}
