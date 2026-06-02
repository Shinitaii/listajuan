export type StepDir = 'add' | 'sub';

// 3 decimals: weight/volume steps go down to 0.125 (125g / 125ml), which 2-decimal
// rounding would mangle (0.125 → 0.13). Powers-of-2 scaling stays exact either way.
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function applyStep(value: number, step: number, dir: StepDir, min: number): number {
  const next = dir === 'add' ? value + step : value - step;
  return Math.max(min, round3(next));
}

export function scaledSteps(baseSteps: number[], scale: number): number[] {
  return baseSteps.map((s) => round3(s * scale));
}
