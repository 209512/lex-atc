// packages/frontend/src/mocks/handlers.ts
// MSW handlers for all /api/* endpoints + SSE stream

import { http, HttpResponse } from 'msw';
import { LEX_CONSTITUTION, SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS, DisputeSchema } from '@lex-atc/shared';
import {
  db,
  broadcast,
  getAgent,
  updateAgent,
  addLog,
  scaleAgents,
  makeProposal,
  applyProposalAction,
  subscribe,
} from './db';

// GET /api/stream (SSE)
// Streams state updates to EventSource clients using a ReadableStream.
// Same-page state changes are delivered via the subscribe() pub-sub;
// BroadcastChannel handles cross-tab sync separately in db.broadcast().
const streamHandler = http.get('/api/stream', () => {
  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Send current state immediately so the UI hydrates before first tick
      const initial = {
        agents: db.agents,
        state: {
          ...db.atcState,
          logs: db.logs.slice(-100),
          governance: db.governance,
          isolation: db.isolation,
          settlement: db.settlement,
          activeAgentCount: db.agents.length,
        },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initial)}\n\n`));

      // Subscribe to future broadcasts from the simulation / API mutations
      unsub = subscribe((payload) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          unsub?.();
          unsub = null;
        }
      });
    },
    cancel() {
      unsub?.();
      unsub = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Auth
const authHandlers = [
  http.post('/api/auth/session', () =>
    HttpResponse.json({ success: true, mode: 'disabled' }),
  ),
  http.delete('/api/auth/session', () =>
    HttpResponse.json({ success: true }),
  ),
];

// System control
const systemHandlers = [
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

// Agent management
const agentHandlers = [
  // GET /api/agents/status
  http.get('/api/agents/status', () => {
    const statusList = db.agents.map(a => ({
      ...a,
      id: a.uuid,
      displayName: a.displayName || a.id,
      priority: db.atcState.priorityAgents.includes(a.uuid),
      isPaused: a.isPaused ?? false,
      l4Phase: 'SANDBOX',
      onchainStatus: null,
      onchainTxid: null,
    }));
    return HttpResponse.json(statusList);
  }),

  // POST /api/agents/scale
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

  // POST /api/agents/register
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

  // POST /api/agents/priority-order  (must come before :uuid routes)
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

  // GET /api/agents/:uuid/config
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

  // POST /api/agents/:uuid/config
  http.post('/api/agents/:uuid/config', async ({ params, request }) => {
    const uuid = String(params.uuid);
    const body = (await request.json()) as { config: any };
    db.agentConfigs[uuid] = body.config;
    const a = getAgent(uuid);
    if (a && body.config?.model) updateAgent(uuid, { model: body.config.model });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  // POST /api/agents/:uuid/pause
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

  // DELETE /api/agents/:uuid
  http.delete('/api/agents/:uuid', ({ params }) => {
    const uuid = String(params.uuid);
    const idx = db.agents.findIndex(a => a.uuid === uuid || a.id === uuid);
    if (idx === -1) return HttpResponse.json({ error: 'Agent not found' }, { status: 404 });
    const [a] = db.agents.splice(idx, 1);
    if (db.atcState.holder === a.uuid) db.atcState.holder = null;
    db.atcState.waitingAgents = db.atcState.waitingAgents.filter(id => id !== a.uuid);
    db.atcState.priorityAgents = db.atcState.priorityAgents.filter(id => id !== a.uuid);
    db.atcState.activeAgentCount = db.agents.length;
    delete db.agentMetas[a.uuid];
    addLog('SYSTEM', `Agent ${a.displayName} terminated`, 'system', {
      domain: LOG_DOMAINS.AGENT,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.TERMINATE_AGENT,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  // POST /api/agents/:uuid/rename
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

  // POST /api/agents/:uuid/priority
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

  // POST /api/agents/:uuid/transfer-lock
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

// Task management
const taskHandlers = [
  http.get('/api/tasks/pending', () =>
    HttpResponse.json({ tasks: db.isolation.tasks }),
  ),

  http.post('/api/tasks/:taskId/finalize', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'FINALIZED';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/tasks/:taskId/rollback', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'ROLLED_BACK';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/tasks/:taskId/cancel', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'CANCELLED';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/tasks/:taskId/retry', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'PENDING';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),
];

// Settlement
const settlementHandlers = [
  http.post('/api/settlement/disputes', async ({ request }) => {
    const raw = await request.json();
    const parsed = DisputeSchema.safeParse(raw);
    if (!parsed.success) {
      return HttpResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const effectiveChannelId = body.channelId || `channel:${body.actorUuid}`;
    const now = Date.now();
    const existing = db.settlement.channels.find(c => c.channelId === effectiveChannelId);
    const nextChannel = {
      channelId: effectiveChannelId,
      status: 'DISPUTED',
      lastStatus: 'DISPUTED',
      disputed: true,
      lastNonce: Number(body.targetNonce ?? 0),
      lastUpdatedAt: now,
      actorUuid: body.actorUuid ?? (raw as any).actorUuid ?? existing?.actorUuid,
      openedBy: body.openedBy ?? (raw as any).actorUuid ?? 'admin',
      targetNonce: Number(body.targetNonce ?? 0),
      reason: body.reason,
      createdAt: existing?.createdAt ?? now,
    };
    if (existing) Object.assign(existing, nextChannel);
    else db.settlement.channels.push(nextChannel);
    addLog('SYSTEM', `Dispute opened for ${effectiveChannelId}`, 'warn', {
      domain: LOG_DOMAINS.SETTLEMENT,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.SETTLEMENT_DISPUTE,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/settlement/slash', async ({ request }) => {
    const body = (await request.json()) as {
      channelId?: string;
      actorUuid?: string;
      reason?: string;
    };
    if (!body.channelId && !body.actorUuid)
      return HttpResponse.json(
        { error: 'Must provide either channelId or actorUuid' },
        { status: 400 },
      );
    const effectiveChannelId = body.channelId ?? `channel:${body.actorUuid}`;
    const now = Date.now();
    const ch = db.settlement.channels.find(c => c.channelId === effectiveChannelId);
    if (ch) {
      Object.assign(ch, {
        status: 'SLASHED',
        lastStatus: 'SLASHED',
        disputed: true,
        actorUuid: body.actorUuid ?? ch.actorUuid,
        reason: body.reason ?? ch.reason ?? 'SLASH',
        lastUpdatedAt: now,
      });
    } else {
      db.settlement.channels.push({
        channelId: effectiveChannelId,
        status: 'SLASHED',
        lastStatus: 'SLASHED',
        disputed: true,
        lastNonce: 0,
        lastUpdatedAt: now,
        actorUuid: body.actorUuid,
        reason: body.reason ?? 'SLASH',
        createdAt: now,
      });
    }
    if (body.actorUuid) {
      const a = getAgent(body.actorUuid);
      if (a) {
        updateAgent(a.uuid, {
          status: 'SLASHED',
          account: {
            ...a.account,
            balance: +(Math.max(0, a.account.balance - LEX_CONSTITUTION.ECONOMY.SLASH_FINE)).toFixed(4),
          },
        });
      }
    }
    addLog('SYSTEM', `Settlement slashed: ${effectiveChannelId}`, 'warn', {
      domain: LOG_DOMAINS.SETTLEMENT,
      stage: LOG_STAGES.EXECUTED,
      actionKey: LOG_ACTIONS.SETTLEMENT_SLASH,
    });
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),
];

// Governance
const governanceHandlers = [
  http.get('/api/governance/proposals', () =>
    HttpResponse.json(db.governance),
  ),

  http.post('/api/governance/proposals', async ({ request }) => {
    const body = (await request.json()) as {
      action: string;
      params?: any;
      timelockMs?: number;
      threshold?: number;
      reason?: string;
    };
    const now = Date.now();
    const threshold = Number(body.threshold ?? 1);
    const timelockMs = Number(body.timelockMs ?? 0);
    const proposal = Object.assign(
      makeProposal('admin', body.action, body.params, body.reason ?? null),
      { timelockMs, threshold, executeAfter: now + timelockMs },
    );
    db.governance.proposals.push(proposal);
    addLog('SYSTEM', `Proposal created: ${body.action}`, 'system');
    broadcast();
    return HttpResponse.json(proposal);
  }),

  http.post('/api/governance/proposals/:proposalId/approve', ({ params }) => {
    const proposal = db.governance.proposals.find(p => p.id === String(params.proposalId));
    if (!proposal) return HttpResponse.json({ error: 'Proposal not found' }, { status: 404 });
    if (!['PENDING', 'READY'].includes(String(proposal.status)))
      return HttpResponse.json({ error: `BAD_STATUS_${proposal.status}` }, { status: 400 });
    if (!proposal.approvals.includes('admin')) proposal.approvals.push('admin');
    const th = Number(proposal.threshold ?? 1);
    if (proposal.approvals.length >= th && proposal.status === 'PENDING') proposal.status = 'READY';
    proposal.approvedAt = Date.now();
    addLog('SYSTEM', `Proposal approved: ${proposal.action}`, 'system');
    broadcast();
    return HttpResponse.json(proposal);
  }),

  http.post('/api/governance/proposals/:proposalId/execute', ({ params }) => {
    const proposal = db.governance.proposals.find(p => p.id === String(params.proposalId));
    if (!proposal) return HttpResponse.json({ error: 'Proposal not found' }, { status: 404 });
    if (proposal.status === 'EXECUTED')
      return HttpResponse.json({ success: true, proposalId: proposal.id, status: 'EXECUTED', idempotent: true });
    if (proposal.status !== 'READY')
      return HttpResponse.json({ error: `BAD_STATUS_${proposal.status}` }, { status: 400 });
    const executeAfter = Number(proposal.executeAfter ?? 0);
    if (executeAfter && Date.now() < executeAfter)
      return HttpResponse.json({ error: 'TIMELOCK_PENDING', executeAfter }, { status: 400 });
    applyProposalAction(proposal.action, proposal.params);
    proposal.status = 'EXECUTED';
    proposal.executedAt = Date.now();
    broadcast();
    return HttpResponse.json(proposal);
  }),

  http.post('/api/governance/proposals/:proposalId/cancel', async ({ params, request }) => {
    const proposal = db.governance.proposals.find(p => p.id === String(params.proposalId));
    if (!proposal) return HttpResponse.json({ error: 'Proposal not found' }, { status: 404 });
    if (proposal.status === 'EXECUTED')
      return HttpResponse.json({ error: 'ALREADY_EXECUTED' }, { status: 400 });
    const body = await request.json().catch(() => ({}) as any) as { reason?: string };
    proposal.status = 'CANCELLED';
    proposal.cancelledAt = Date.now();
    addLog('SYSTEM', `Proposal cancelled: ${proposal.action} (${body.reason ?? 'CANCEL'})`, 'system');
    broadcast();
    return HttpResponse.json(proposal);
  }),
];

export const handlers = [
  streamHandler,
  ...authHandlers,
  ...systemHandlers,
  ...agentHandlers,
  ...taskHandlers,
  ...settlementHandlers,
  ...governanceHandlers,
];
