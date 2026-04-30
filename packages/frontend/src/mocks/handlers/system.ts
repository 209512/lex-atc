import { http, HttpResponse } from 'msw';
import { SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared';
import { db, broadcast, addLog } from '../core/db';

export const systemHandlers = [
  http.post('/api/override', () => {
    db.atcState.overrideSignal = true;
    db.atcState.holder = SYSTEM.ADMIN_HOLDER_ID;
    addLog('SYSTEM', '🚨 Human Override Activated', 'warn', {
      domain: LOG_DOMAINS.SYSTEM,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.OVERRIDE,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/release', () => {
    if (db.atcState.holder === SYSTEM.ADMIN_HOLDER_ID) db.atcState.holder = null;
    db.atcState.overrideSignal = false;
    addLog('SYSTEM', '✅ Override Released', 'info', {
      domain: LOG_DOMAINS.SYSTEM,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.RELEASE,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/stop', async ({ request }) => {
    const body = (await request.json()) as { enable: boolean };
    db.atcState.globalStop = Boolean(body.enable);
    addLog('SYSTEM', `Global Stop ${body.enable ? 'Enabled' : 'Disabled'}`, 'system', {
      domain: LOG_DOMAINS.SYSTEM,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.TOGGLE_STOP,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),
];

