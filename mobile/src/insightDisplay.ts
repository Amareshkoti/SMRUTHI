/** Presentation helpers for computed insights. No test-specific thresholds live here. */
export function fmt(n: number): string {
  return Math.abs(n) < 1 ? n.toFixed(2) : n.toFixed(1);
}
