export interface ChartPoint {
  cx: number;
  cy: number;
  value: number;
}

export interface ChartBand {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChartGeom {
  w: number;
  h: number;
  base: number;
  X: (i: number) => number;
  Y: (v: number) => number;
  path: string;
  area: string;
  pts: ChartPoint[];
  thrY: number;
  band: ChartBand | null;
}

/**
 * Lays out a value series onto an SVG-shaped rectangle: least-squares-friendly
 * padding around the value range, plus optional threshold line and reference
 * band. Same layout math the design canvas used, just typed and reusable for
 * both the full Signal chart and the small Home sparklines.
 */
export function chartGeom(
  values: number[],
  opts: {
    w?: number;
    h?: number;
    padL?: number;
    padR?: number;
    padT?: number;
    padB?: number;
    threshold?: number;
    band?: [number | null, number | null] | null;
    extraSpan?: number;
  } = {},
): ChartGeom {
  const w = opts.w ?? 390;
  const h = opts.h ?? 238;
  const padL = opts.padL ?? 26;
  const padR = opts.padR ?? 26;
  const padT = opts.padT ?? 24;
  const padB = opts.padB ?? 42;

  const candidates = [...values];
  if (opts.threshold !== undefined) candidates.push(opts.threshold);
  if (opts.band && opts.band[0] !== null) candidates.push(opts.band[0]);
  if (opts.band && opts.band[1] !== null) candidates.push(opts.band[1]);

  const lo = Math.min(...candidates);
  const hi = Math.max(...candidates);
  const pad = (hi - lo) * 0.28 || 0.5;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const span = Math.max(1, values.length - 1 + (opts.extraSpan ?? 0));
  const X = (i: number) => padL + (i * (w - padL - padR)) / span;
  const Y = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * (h - padT - padB);
  const base = h - padB;

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = `${path} L ${X(values.length - 1).toFixed(1)} ${base} L ${X(0).toFixed(1)} ${base} Z`;
  const pts = values.map((v, i) => ({ cx: X(i), cy: Y(v), value: v }));

  let band: ChartBand | null = null;
  if (opts.band) {
    const top = Y(opts.band[1] ?? yMax);
    const bottom = opts.band[0] === null ? base : Y(opts.band[0]);
    band = { x: 0, y: top, w, h: Math.max(2, bottom - top) };
  }

  return {
    w,
    h,
    base,
    X,
    Y,
    path,
    area,
    pts,
    thrY: opts.threshold !== undefined ? Y(opts.threshold) : -10,
    band,
  };
}
