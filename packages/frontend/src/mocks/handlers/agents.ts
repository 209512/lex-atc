import { http, HttpResponse } from 'msw';
import { SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared';
import { db, broadcast, getAgent, updateAgent, addLog, scaleAgents } from '../core/db';

export const agentHandlers = [
  http.get('/api/agents/status', () => {
    const statusList = db.agents.map(a => ({
      ...a,
      id: a.uuid,
      displayName: a.displayName || a.id,
      priority: db.atcState.priorityAgents.includes(a.uuid),
      isPaused: a.isPaused ?? false,
      orbit: db.agentMetas[a.uuid]
        ? {
            seed: db.agentMetas[a.uuid].seed,
            spawnTime: db.agentMetas[a.uuid].spawnTime,
            totalPausedMs: db.agentMetas[a.uuid].totalPausedMs,
          }
        : undefined,
      l4Phase: 'SANDBOX',
      onchainStatus: null,
      onchainTxid: null,
    }));
    return HttpResponse.json(statusList);
  }),

  http.post('/api/agents/scale', async ({ request }) => {
    const body = (await request.json()) as { count: number };
    const count = Number(body.count);
    if (count < 0 || count > 10)
      return HttpResponse.json({ error: 'Invalid agent count (0-10)' }, { status: 400 });
    scaleAgents(count);
    addLog('SYSTEM', `Agent pool scaled to ${count}`, 'system', {
      domain: LOG_DOMAINS.AGENT,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.SCALE_AGENTS,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/agents/register', async ({ request }) => {
    const body = (await request.json()) as { uuid: string; config: any };
    const { uuid, config } = body;
    if (!uuid || !config)
      return HttpResponse.json({ error: 'Missing uuid or config' }, { status: 400 });
    db.agentConfigs[uuid] = config;
    const a = getAgent(uuid);
    if (a && config.model) updateAgent(uuid, { model: config.model });
    broadcast();
    return HttpResponse.json({ success: true, message: 'Registered config for agent', scheduled: true });
  }),

  http.post('/api/agents/priority-order', async ({ request }) => {
    const body = (await request.json()) as { order: string[] };
    if (!Array.isArray(body.order))
      return HttpResponse.json({ error: 'Order must be an array' }, { status: 400 });
    db.atcState.priorityAgents = body.order;
    for (const a of db.agents) {
      updateAgent(a.uuid, { priority: body.order.includes(a.uuid) });
    }
    broadcast();
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/agents/:uuid/config', ({ params }) => {
    const uuid = String(params.uuid);
    const config = db.agentConfigs[uuid];
    if (!config)
      return HttpResponse.json({
        provider: 'mock',
        model: '',
        systemPrompt: SYSTEM.DEFAULT_SYSTEM_PROMPT,
      });
    return HttpResponse.json(config);
  }),

  http.post('/api/agents/:uuid/config', async ({ params, request }) => {
    const uuid = String(params.uuid);
    const body = (await request.json()) as { config: any };
    db.agentConfigs[uuid] = body.config;
    const a = getAgent(uuid);
    if (a && body.config?.model) updateAgent(uuid, { model: body.config.model });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/agents/:uuid/pause', async ({ params, request }) => {
    const uuid = String(params.uuid);
    const body = (await request.json()) as { pause: boolean };
    const meta = db.agentMetas[uuid];
    if (meta) {
      if (body.pause && !meta.pausedAt) meta.pausedAt = Date.now();
      else if (!body.pause && meta.pausedAt) {
        meta.totalPausedMs += Date.now() - meta.pausedAt;
        meta.pausedAt = null;
      }
    }
    const ok = updateAgent(uuid, {
      isPaused: body.pause,
      status: body.pause ? 'PAUSED' : 'IDLE',
      activity: body.pause ? 'Paused by admin' : 'Idle — ready',
    });
    if (!ok) return HttpResponse.json({ error: 'Agent not found' }, { status: 404 });
    addLog(uuid, `Agent ${body.pause ? 'Paused' : 'Resumed'}`, 'system', {
      domain: LOG_DOMAINS.AGENT,
      stage: LOG_STAGES.EXECUTED,
      actionKey: body.pause ? LOG_ACTIONS.PAUSE_AGENT : LOG_ACTIONS.RESUME_AGENT,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.delete('/api/agents/:uuid', ({ params }) => {
    const uuid = String(params.uuid);
    const idx = db.agents.findIndex(a => a.uuid === uuid || a.id === uuid);
    if (idx === -1) return HttpResponse.json({ error: 'Agent not found' }, { status: 404 });
    const [removed] = db.agents.splice(idx, 1);
    delete db.agentMetas[removed.uuid];
    db.atcState.waitingAgents = db.atcState.waitingAgents.filter(id => id !== uuid);
    db.atcState.priorityAgents = db.atcState.priorityAgents.filter(id => id !== uuid);
    if (db.atcState.holder === uuid) db.atcState.holder = null;
    db.atcState.activeAgentCount = db.agents.length;
    addLog(uuid, 'Agent Terminated', 'warn', {
      domain: LOG_DOMAINS.AGENT,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.TERMINATE_AGENT,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/agents/:uuid/rename', async ({ params, request }) => {
    const uuid = String(params.uuid);
    const body = (await request.json()) as { newName: string };
    if (!body.newName || typeof body.newName !== 'string')
      return HttpResponse.json({ error: 'Invalid Name' }, { status: 400 });
    const newName = body.newName.trim().substring(0, 20);
    const ok = updateAgent(uuid, { displayName: newName });
    if (!ok) return HttpResponse.json({ error: 'Agent not found' }, { status: 404 });
    addLog(uuid, `Renamed to ${newName}`, 'system');
    broadcast();
    return HttpResponse.json({ success: true, name: newName });
  }),

  http.post('/api/agents/:uuid/priority', async ({ params, request }) => {
    const uuid = String(params.uuid);
    const body = (await request.json()) as { enable: boolean };
    if (body.enable) {
      if (!db.atcState.priorityAgents.includes(uuid)) db.atcState.priorityAgents.push(uuid);
    } else {
      db.atcState.priorityAgents = db.atcState.priorityAgents.filter(id => id !== uuid);
    }
    updateAgent(uuid, { priority: body.enable });
    addLog(uuid, `Priority ${body.enable ? 'Enabled' : 'Disabled'}`, 'system');
    broadcast();
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/agents/:uuid/transfer-lock', ({ params }) => {
    const uuid = String(params.uuid);
    const a = getAgent(uuid);
    if (!a) return HttpResponse.json({ error: 'Agent not found' }, { status: 404 });
    db.atcState.forcedCandidate = uuid;
    db.atcState.holder = uuid;
    updateAgent(uuid, { status: 'ACTIVE', activity: 'Lock transferred by admin' });
    addLog(uuid, '✨ Lock Transferred by Admin', 'success');
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),
];
