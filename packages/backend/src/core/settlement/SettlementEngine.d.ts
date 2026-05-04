import type { SettlementState } from './settlementReducer.types';
import type { SettlementRepo } from './settlementRepo';

export default class SettlementEngine {
  atcService: any;
  repo: SettlementRepo;
  state: SettlementState;
  constructor(atcService: any);
  getPublicState(): any;
  start(): void;
  stop(): void;
  ensureChannel(agent: any): Promise<string>;
  onTaskExecuted(task: any, execResult: any): Promise<any>;
  flushPending(): Promise<any>;
  ensureFinalizedForAgent(agentUuid: string, opts?: any): Promise<any>;
  submitSnapshot(snapshot: any, actorUuid: string, opts?: any): Promise<any>;
  openDispute(args: any): Promise<any>;
  slash(args: any): Promise<any>;
}

