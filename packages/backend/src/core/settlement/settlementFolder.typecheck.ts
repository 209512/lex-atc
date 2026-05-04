import SettlementEngine from './SettlementEngine';
import runAutoMonitoring from './settlementMonitoring';
import { createSettlementRepo } from './settlementRepo';
import { createSettlementState } from './settlementState';
import { ensureChannel, onTaskExecuted, flushPending } from './settlementChannels';
import { ensureFinalizedForAgent, submitSnapshot } from './settlementSnapshots';
import { openDispute } from './settlementDisputes';

const repo = createSettlementRepo({ db: {} as any });
void repo;

const state = createSettlementState();
void state;

const engine = new SettlementEngine({} as any);
void engine;

void ensureChannel(engine as any, {} as any);
void onTaskExecuted(engine as any, {} as any, {} as any);
void flushPending(engine as any);
void ensureFinalizedForAgent(engine as any, 'AGT-001');
void submitSnapshot(engine as any, {} as any, 'AGT-001');
void openDispute(engine as any, {});
void runAutoMonitoring(engine as any);

