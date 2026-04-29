// packages/frontend/src/mocks/browser.ts
// MSW browser worker setup

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
