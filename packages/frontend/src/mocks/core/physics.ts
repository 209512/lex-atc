import type { OrbitalLevel, RiskVector8 } from '@lex-atc/shared';
import { PHYSICS, getOrbitPosition } from '@/utils/orbit';

export { PHYSICS, getOrbitPosition };

export const clampRiskVector8 = (v: unknown): RiskVector8 | undefined => {
  if (!v) return undefined;
  if (!Array.isArray(v)) return undefined;
  if (v.length !== 8) return undefined;
  if (v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) return undefined;
  return v as RiskVector8;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const hashUnit = (seed: number) => {
  const x = Math.sin(seed) * 43758.5453123;
  return x - Math.floor(x);
};

export const computeRiskVector = (score: number, category: string): RiskVector8 => {
  const s = clamp01(score);
  const h = hashString(category || 'DEFAULT');
  const baseSeed = (h % 10000) / 10000;
  const spread = 0.35 + s * 0.65;

  const axis = (i: number, bias: number) => {
    const n1 = hashUnit(baseSeed * 1000 + i * 17.13);
    const n2 = hashUnit(baseSeed * 2000 + i * 31.77 + bias * 10.1);
    const shaped = clamp01((n1 * 0.55 + n2 * 0.45) * spread + bias * 0.25);
    return shaped;
  };

  const threat = axis(0, s);
  const novelty = axis(1, (hashUnit(h + 1) * 0.6 + s * 0.4));
  const entropy = axis(2, (hashUnit(h + 2) * 0.7 + s * 0.3));
  const stability = axis(3, 1 - s);
  const risk = axis(4, s * 0.8);
  const impact = axis(5, s);
  const exposure = axis(6, (hashUnit(h + 6) * 0.5 + s * 0.5));
  const timing = axis(7, (hashUnit(h + 7) * 0.4 + s * 0.6));

  return [threat, novelty, entropy, stability, risk, impact, exposure, timing];
};

export const resolveOrbitalLevel = (seed: number, riskVector?: RiskVector8): OrbitalLevel => {
  const v = clampRiskVector8(riskVector);
  if (v) {
    const score = v.reduce((acc, n) => acc + Math.abs(n), 0);
    if (score > 5.5) return 'L3';
    if (score > 3.5) return 'L2';
    if (score > 1.8) return 'L1';
    return 'GROUND';
  }
  const layer = seed % 4;
  if (layer === 3) return 'L3';
  if (layer === 2) return 'L2';
  if (layer === 1) return 'L1';
  return 'GROUND';
};
