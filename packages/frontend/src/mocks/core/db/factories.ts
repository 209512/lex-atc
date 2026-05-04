import type { LexAgent, OrbitalLevel, RiskVector8 } from '@lex-atc/shared';
import { LEX_CONSTITUTION, SYSTEM } from '@lex-atc/shared';
import { getOrbitPosition, resolveOrbitalLevel } from '../physics';

export const randHex = (len: number) =>
  Array.from({ length: len }, () => ((Math.random() * 16) | 0).toString(16)).join('');

export const makeProposal = (
  adminId: string,
  action: string,
  params: any,
  reason: string | null,
) => ({
  id: `prop-${Date.now()}-${randHex(4)}`,
  adminId,
  action,
  params: params ?? {},
  reason: reason ?? action,
  status: 'PENDING' as 'PENDING' | 'READY' | 'EXECUTED' | 'CANCELLED' | 'FAILED',
  approvals: [] as string[],
  threshold: 1,
  timelockMs: 0,
  executeAfter: Date.now(),
  createdAt: Date.now(),
  approvedAt: null as number | null,
  executedAt: null as number | null,
  cancelledAt: null as number | null,
});

export const makeAgent = (seed: number, counter: number): LexAgent => {
  const name = `AGT-${String(counter).padStart(3, '0')}`;
  const riskVector: RiskVector8 = [0, 0, 0, 0, 0, 0, 0, 0];
  const orbitalLevel: OrbitalLevel = resolveOrbitalLevel(seed, riskVector);
  return {
    uuid: name,
    id: name,
    displayName: name,
    status: 'IDLE',
    activity: 'Idle — ready',
    account: {
      address: `0x${randHex(40)}`,
      balance: LEX_CONSTITUTION.ECONOMY.INITIAL_BALANCE,
      escrow: LEX_CONSTITUTION.ECONOMY.MIN_ESCROW,
      reputation: 100,
      difficulty: LEX_CONSTITUTION.MINING.BASE_DIFFICULTY,
      totalEarned: 0,
      lastWorkHash: '',
    },
    model: SYSTEM.DEFAULT_AGENT_MODEL,
    provider: 'mock',
    position: getOrbitPosition(seed, 0),
    lastUpdated: Date.now(),
    priority: false,
    color: `hsl(${(seed * 137.5) % 360}, 70%, 60%)`,
    isPaused: false,
    metrics: { ts: null },
    orbitalLevel,
    riskVector,
  };
};

