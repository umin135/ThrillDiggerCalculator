import type { Level } from '../game/levels';

export function pct(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  const v = p * 100;
  if (v < 0.1) return '<0.1%';
  if (v > 99.9) return '>99.9%';
  return v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
}

export function signed(n: number, digits = 0): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

export function position(level: Level, i: number): string {
  return `${Math.floor(i / level.width) + 1}행 ${(i % level.width) + 1}열`;
}
