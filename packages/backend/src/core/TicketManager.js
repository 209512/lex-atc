const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

class TicketManager {
    constructor(atcService) {
        this.atcService = atcService;
        this.tickets = new Map();
        this.ticketEscrow = new Map();
    }

    async ensureTicket(shardId, uuid, bidAmount = 0) {
        const sid = String(shardId);
        const id = String(uuid);
        if (!this.tickets.has(sid)) this.tickets.set(sid, new Map());
        const map = this.tickets.get(sid);
        if (map.has(id)) return map.get(id);

        const agent = this.atcService.agents.get(id);
        if (agent?.isDraining) {
            agent.log(`🚫 Ticket denied: Agent is draining (shutting down)`, 'warn');
            return null;
        }

        const bid = Number(bidAmount || 0);
        if (agent) {
            if (agent.account.balance < bid) {
                agent.log(`❌ Ticket denied: Insufficient funds for bid ${bid} SOL`, 'warn');
                return null;
            }
            if (bid > 0) {
                agent.account.balance -= bid;
                this.ticketEscrow.set(id, bid);
            }
        }

        const ticket = await this.atcService.sequencer.issueTicket(sid, id, bid);
        map.set(id, { ticket, bidAmount: bid, lastSeen: Date.now() });
        this.updateWaitingAgents(sid);
        return map.get(id);
    }

    async cancelTicket(shardId, uuid) {
        const sid = String(shardId);
        const id = String(uuid);
        const map = this.tickets.get(sid);
        if (!map) return;
        const t = map.get(id);
        map.delete(id);

        // Refund bid from escrow
        if (this.ticketEscrow.has(id)) {
            const agent = this.atcService.agents.get(id);
            const bid = this.ticketEscrow.get(id);
            if (agent) {
                agent.account.balance += bid;
                agent.log(`💸 Ticket cancelled: ${bid} SOL bid refunded.`, 'info');
            }
            this.ticketEscrow.delete(id);
        }

        const serving = await this.atcService.sequencer.getServingTicket(sid);
        if (t && t.ticket === serving) {
            await this.atcService.sequencer.advanceServingTicket(sid);
        }
        this.updateWaitingAgents(sid);
    }

    async completeTicketTurn(shardId, uuid) {
        const sid = String(shardId);
        const id = String(uuid);
        const map = this.tickets.get(sid);
        if (!map) return;
        const t = map.get(id);
        if (!t) return;
        const serving = await this.atcService.sequencer.getServingTicket(sid);
        if (t.ticket === serving) {
            await this.atcService.sequencer.advanceServingTicket(sid);
        }
        map.delete(id);
        this.updateWaitingAgents(sid);
    }

    updateWaitingAgents(shardId) {
        const shard = this.atcService.state.shards?.[shardId];
        if (!shard) return;
        const map = this.tickets.get(String(shardId));
        const agents = [];
        if (map) {
            for (const [uuid, info] of map.entries()) {
                agents.push({ uuid, ticket: info.ticket });
            }
        }
        agents.sort((a, b) => a.ticket - b.ticket);
        shard.waitingAgents = agents.map(a => a.uuid);

        const primary = this.atcService.getShardIds()[0];
        if (primary === shardId) this.atcService._syncLegacyStateFromShard(primary);
    }

    collectEscrowBid(uuid) {
        if (this.ticketEscrow.has(uuid)) {
            const bid = this.ticketEscrow.get(uuid);
            this.atcService.treasury.vault.systemReserve += bid;
            this.ticketEscrow.delete(uuid);
            this.atcService.addLog('SYSTEM', `💰 Collected ${bid} SOL bid from ${uuid}`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.EVICTION_SLASH });
        }
    }
}
module.exports = TicketManager;
