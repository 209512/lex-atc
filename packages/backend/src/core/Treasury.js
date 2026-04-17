// backend/src/core/Treasury.js
const { LEX_CONSTITUTION, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const WalletEngine = require('./WalletEngine');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const JobQueue = require('./queue/JobQueue');

/**
 * ATC 경제 시스템
 * - 자원 접근료(Entry Fee) 징수
 * - 작업 완료 보상(Reward) 지급
 * - 오류 및 악성 행위 페널티(Slashing) 관리
 */
class Treasury {
    constructor(atcService) {
        this.atcService = atcService;
        this.systemVault = {
            address: WalletEngine.getTreasuryAddress(),
            totalFeesCollected: 0,
            totalRewardsDistributed: 0
        };
    }

    _math(val) { return parseFloat(Number(val).toFixed(8)); }

    collectEntryFee(agent, ctx = null) {
        const fee = LEX_CONSTITUTION.ECONOMY.ENTRY_FEE;
        
        if (agent.account.balance >= fee) {
            agent.account.balance = this._math(agent.account.balance - fee);
            this.systemVault.totalFeesCollected = this._math(this.systemVault.totalFeesCollected + fee);
            
            agent.log(`💸 Entry Fee Paid: ${fee} SOL`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.MINE_REWARD });

            this.atcService.recordEconomicEvent(agent, {
                shardId: ctx?.shardId,
                shardEpoch: ctx?.shardEpoch,
                resourceId: ctx?.resourceId,
                fenceToken: ctx?.fenceToken,
                action: 'ENTRY_FEE',
                payload: { deltaBalance: -fee, deltaReputation: 0, fee }
            }).catch(err => {
                if (process.env.NODE_ENV !== 'test') logger.error('[Treasury] recordEconomicEvent Error:', err.message);
            });
            return true;
        }
        return false;
    }

    collectHoldingFee(agent, amount, reason, ctx = null) {
        const fee = this._math(Number(amount || 0));
        if (!fee || fee <= 0) return true;
        if (!agent || !agent.account) return false;

        if (agent.account.balance < fee) {
            return false;
        }

        agent.account.balance = this._math(agent.account.balance - fee);
        this.systemVault.totalFeesCollected = this._math(this.systemVault.totalFeesCollected + fee);
        agent.log(`⏱️ Holding Fee: ${fee} SOL (${reason})`, 'warn', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.MINE_REWARD });

        this.atcService.recordEconomicEvent(agent, {
            shardId: ctx?.shardId,
            shardEpoch: ctx?.shardEpoch,
            resourceId: ctx?.resourceId,
            fenceToken: ctx?.fenceToken,
            action: 'HOLDING_FEE',
            payload: { deltaBalance: -fee, deltaReputation: 0, fee, reason, step: ctx?.step ?? null }
        }).catch(err => {
            if (process.env.NODE_ENV !== 'test') logger.error('[Treasury] recordEconomicEvent Error:', err.message);
        });
        return true;
    }

    distributeReward(agent, ctx = null) {
        const reward = LEX_CONSTITUTION.ECONOMY.TASK_REWARD;
        
        agent.account.balance = this._math(agent.account.balance + reward);
        agent.account.totalEarned = this._math(agent.account.totalEarned + reward);
        this.systemVault.totalRewardsDistributed = this._math(this.systemVault.totalRewardsDistributed + reward);

        const prevRep = agent.account.reputation;
        agent.account.reputation = Math.min(100, agent.account.reputation + 1);

        this.atcService.recordEconomicEvent(agent, {
            shardId: ctx?.shardId,
            shardEpoch: ctx?.shardEpoch,
            resourceId: ctx?.resourceId,
            fenceToken: ctx?.fenceToken,
            action: 'REWARD',
            payload: { deltaBalance: reward, deltaReputation: agent.account.reputation - prevRep, reward }
        }).catch(err => {
            if (process.env.NODE_ENV !== 'test') logger.error('[Treasury] recordEconomicEvent Error:', err.message);
        });
    }

    applySlashing(agent, reason, ctx = null) {
        const fine = LEX_CONSTITUTION.ECONOMY.SLASH_FINE || 0.05;
        const penalty = LEX_CONSTITUTION.ECONOMY.REPUTATION_PENALTY || 20;
        const addDiff = LEX_CONSTITUTION.ECONOMY.PENALTY_ADD_DIFFICULTY || 2;
        
        // Deduct fine up to balance, preventing negative deductions when balance is already negative
        const availableBalance = Math.max(0, agent.account.balance);
        const actualFine = Math.min(fine, availableBalance);
        
        agent.account.balance = this._math(agent.account.balance - actualFine);
        this.systemVault.totalFeesCollected = this._math(this.systemVault.totalFeesCollected + actualFine);
        
        const prevRep = agent.account.reputation;
        agent.account.reputation = Math.max(0, agent.account.reputation - penalty);
        
        agent.account.difficulty = Math.min(6, agent.account.difficulty + addDiff); // Cap to 6
        
        agent.log(`🚫 SLASHED (${reason}): -${actualFine} SOL / Rep: -${penalty} / Diff: +${addDiff}`, 'critical', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.EVICTION_SLASH });

        JobQueue.add('audit-queue', `econ:${agent.uuid}:SLASHING`, {
            agentUuid: String(agent.uuid),
            params: {
                shardId: ctx?.shardId,
                shardEpoch: ctx?.shardEpoch,
                resourceId: ctx?.resourceId,
                fenceToken: ctx?.fenceToken,
                action: 'SLASHING',
                actorUuid: String(agent.uuid),
                correlationId: `econ:SLASHING:${agent.uuid}:${Date.now()}`,
                payload: {
                    balance: agent.account.balance,
                    reputation: agent.account.reputation,
                    deltaBalance: -actualFine,
                    deltaReputation: agent.account.reputation - prevRep,
                    deltaDifficulty: addDiff,
                    fine: actualFine,
                    penalty,
                    reason
                }
            }
        });
    }
    
    transferCompensation(fromAgent, toAgent, amount, ctx = null) {
        const compensation = this._math(amount);
        if (!fromAgent || !toAgent || !fromAgent.account || !toAgent.account) return false;

        // Allow negative balance (Debt) for forced compensation
        fromAgent.account.balance = this._math(fromAgent.account.balance - compensation);
        toAgent.account.balance = this._math(toAgent.account.balance + compensation);

        const reason = ctx?.reason || 'COMPENSATION';
        fromAgent.log(`💸 Paid Compensation: ${compensation} SOL to ${toAgent.id} (${reason})`, 'warn', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.EVICTION_SLASH });
        toAgent.log(`💰 Received Compensation: ${compensation} SOL from ${fromAgent.id} (${reason})`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.MINE_REWARD });

        this.atcService.recordEconomicEvent(fromAgent, {
            ...ctx,
            action: 'COMPENSATION_PAID',
            payload: { target: toAgent.uuid, amount: compensation }
        }).catch(err => {
            if (process.env.NODE_ENV !== 'test') logger.error('[Treasury] transferCompensation record Error:', err.message);
        });

        return true;
    }

    async recordEconomicEvent(agentId, type, amount, metadata = {}) {
        if (!this.atcService.logManager) return null;
        const shardId = this.atcService.getShardIdForAgent(agentId);
        const epoch = this.atcService.state.shards[shardId]?.epoch || 0;
        return this.atcService.logManager.recordEvent({
            shardId,
            shardEpoch: epoch,
            action: type,
            actorUuid: agentId,
            payload: { amount, ...metadata }
        }).catch(e => logger.error(`[Treasury] Failed to record economic event for ${agentId}: ${e.message}`));
    }

    stop() {
        if (this.treasuryInterval) {
            clearInterval(this.treasuryInterval);
            this.treasuryInterval = null;
        }
    }
}

module.exports = Treasury;
