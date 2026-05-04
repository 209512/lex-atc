import { http, HttpResponse } from 'msw';
import { LEX_CONSTITUTION, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS, DisputeSchema } from '@lex-atc/shared';
import { db, broadcast, getAgent, updateAgent, addLog } from '../core/db';

export const settlementHandlers = [
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
    const effectiveChannelId = body.channelId || `channel:${body.actorUuid}`;
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
