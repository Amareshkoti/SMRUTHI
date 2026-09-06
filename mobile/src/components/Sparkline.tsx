import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { chartGeom } from '../chartGeom';

/** Tiny path-only chart for Home's "everything else moving" rows. */
export function Sparkline({ values, color, width = 76, height = 30 }: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const g = chartGeom(values, { w: width, h: height, padL: 2, padR: 2, padT: 6, padB: 6 });
  return (
    <Svg width={width} height={height}>
      <Path d={g.path} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}
