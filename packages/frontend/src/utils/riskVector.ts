import type { RiskVector8 } from '@lex-atc/shared';

export const RISK_AXES = ['T', 'N', 'E', 'S', 'R', 'I', 'X', 'Tm'] as const;
export const RISK_AXES_COMPACT = ['T', 'E', 'I', 'Tm'] as const;

export type RiskAxisKey = typeof RISK_AXES[number];

export const RISK_AXIS_META: Record<RiskAxisKey, { name: string; description: string }> = {
  T: {
    name: 'Threat',
    description: '위협 수준. 높을수록 공격/위험 가능성이 높음',
  },
  N: {
    name: 'Novelty',
    description: '새로움/비정형성. 높을수록 과거 패턴과 다름',
  },
  E: {
    name: 'Entropy',
    description: '불확실성/변동성. 높을수록 예측이 어려움',
  },
  S: {
    name: 'Stability',
    description: '안정성. 낮을수록 시스템이 흔들리는 상태',
  },
  R: {
    name: 'Risk',
    description: '리스크 총량. 높을수록 손실/오류 가능성이 큼',
  },
  I: {
    name: 'Impact',
    description: '영향도. 높을수록 결과의 파급이 큼',
  },
  X: {
    name: 'Exposure',
    description: '노출도. 높을수록 외부 영향/관측/공격 표면이 큼',
  },
  Tm: {
    name: 'Timing',
    description: '타이밍 압력/시간 민감도. 높을수록 즉시 대응이 필요함',
  },
};

export const RISK_AXIS_INDEX: Record<RiskAxisKey, 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7> = {
  T: 0,
  N: 1,
  E: 2,
  S: 3,
  R: 4,
  I: 5,
  X: 6,
  Tm: 7,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const normalizeRiskVector8 = (v: unknown): RiskVector8 => {
  if (!v || !Array.isArray(v) || v.length !== 8) return [0, 0, 0, 0, 0, 0, 0, 0];
  return [
    typeof v[0] === 'number' && Number.isFinite(v[0]) ? clamp01(v[0]) : 0,
    typeof v[1] === 'number' && Number.isFinite(v[1]) ? clamp01(v[1]) : 0,
    typeof v[2] === 'number' && Number.isFinite(v[2]) ? clamp01(v[2]) : 0,
    typeof v[3] === 'number' && Number.isFinite(v[3]) ? clamp01(v[3]) : 0,
    typeof v[4] === 'number' && Number.isFinite(v[4]) ? clamp01(v[4]) : 0,
    typeof v[5] === 'number' && Number.isFinite(v[5]) ? clamp01(v[5]) : 0,
    typeof v[6] === 'number' && Number.isFinite(v[6]) ? clamp01(v[6]) : 0,
    typeof v[7] === 'number' && Number.isFinite(v[7]) ? clamp01(v[7]) : 0,
  ];
};

export const splitRiskVectorRows = <T,>(items: readonly T[]) => [
  items.slice(0, 4),
  items.slice(4, 8),
];

export type RiskVectorDisplayMode = 'full' | 'compact';

export const getAxesForDisplayMode = (mode: RiskVectorDisplayMode) =>
  (mode === 'compact' ? RISK_AXES_COMPACT : RISK_AXES);
