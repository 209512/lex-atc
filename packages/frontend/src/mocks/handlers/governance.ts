import { http, HttpResponse } from 'msw';
import { db, broadcast, addLog, makeProposal, applyProposalAction } from '../core/db';

export const governanceHandlers = [
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
    const executeAfter = Number((proposal as any).executeAfter ?? 0);
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

