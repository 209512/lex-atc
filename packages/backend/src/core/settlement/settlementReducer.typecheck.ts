import { createSettlementState } from './settlementState';
import { ACTIONS, reduce } from './settlementReducer';
import type { SettlementReducerAction } from './settlementReducer.types';

const state = createSettlementState();

const action: SettlementReducerAction = {
  type: ACTIONS.ENQUEUE_TASK,
  channelId: 'channel:AGT-001',
  entry: { task: { id: 't1' } },
};

reduce(state, action);

