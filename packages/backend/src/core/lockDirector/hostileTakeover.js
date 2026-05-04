const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

module.exports = async function executeHostileTakeover(director, attackerUuid, victimUuid, cost) {
    const attacker = director.atcService.agents.get(attackerUuid);
    const victim = director.atcService.agents.get(victimUuid);
    
    if (!attacker || !victim) return false;
    
    if (attacker.account.balance < cost) {
        attacker.log(`❌ Takeover failed: Insufficient funds`, 'warn');
        return false;
    }

    if (!director.atcService.takeoverEscrow) {
        director.atcService.takeoverEscrow = new Map();
    }

    attacker.account.balance -= cost;
    director.atcService.takeoverEscrow.set(attackerUuid, {
         attacker: attackerUuid,
         victim: victimUuid,
         amount: cost,
         timestamp: Date.now(),
         shardId: director.atcService.getShardIdForAgent(attackerUuid)
    });

    director.atcService.addLog('SYSTEM', `⚔️ ${attacker.id} initiated hostile takeover against ${victim.id}. Funds in escrow.`, 'critical', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
    
    const result = await director.transferLock(attackerUuid, true);
    return result.success;
};

