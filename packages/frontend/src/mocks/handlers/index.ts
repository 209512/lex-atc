import { streamHandlers } from './stream';
import { authHandlers } from './auth';
import { systemHandlers } from './system';
import { agentHandlers } from './agents';
import { taskHandlers } from './tasks';
import { settlementHandlers } from './settlement';
import { governanceHandlers } from './governance';

export const handlers = [
  ...streamHandlers,
  ...authHandlers,
  ...systemHandlers,
  ...agentHandlers,
  ...taskHandlers,
  ...settlementHandlers,
  ...governanceHandlers,
];

