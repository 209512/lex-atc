const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS, LEX_CONSTITUTION } = require('@lex-atc/shared');
const logger = require('../../utils/logger');

const toLamports = (sol) => Math.round(Number(sol || 0) * 1_000_000_000);

const readGasParams = () => {
    const solanaFeeSol = Number(process.env.SOLANA_AVG_TX_FEE_SOL || 0.000005);
    const solUsd = Number(process.env.SOLANA_USD_PRICE || 150);
    return { solanaFeeSol, solUsd };
};

const computeGasEconomics = (engine) => {
    const { solanaFeeSol, solUsd } = readGasParams();
    const aTx = Number(engine.gas.immediateTxCount || 0);
    const bTx = Number(engine.gas.snapshotTxCount || 0);
    const costAUsd = aTx * solanaFeeSol * solUsd;
    const costBUsd = bTx * solanaFeeSol * solUsd;
    const savedUsd = Math.max(0, costAUsd - costBUsd);
    const savingsPct = costAUsd > 0 ? (savedUsd / costAUsd) * 100 : 0;
    return {
        mode: engine.provider?.enabled ? 'ANCHOR' : 'SIMULATION',
        solanaFeeSol,
        solUsd,
        immediateTxCount: aTx,
        snapshotTxCount: bTx,
        costAUsd,
        costBUsd,
        savedUsd,
        savingsPct,
        updatedAt: Date.now(),
    };
};

const emitGasEconomics = (engine, reason = 'tick') => {
    const econ = computeGasEconomics(engine);
    engine.gas.lastUpdatedAt = econ.updatedAt;
    if (engine.atcService?.state) engine.atcService.state.gasEconomics = econ;
    if (typeof engine.atcService.emitState === 'function') engine.atcService.emitState();

    const now = Date.now();
    if (engine.atcService?.addLog && (now - Number(engine.gas.lastLoggedAt || 0)) > 15_000) {
        engine.gas.lastLoggedAt = now;
        const pct = econ.savingsPct.toFixed(2);
        const usd = econ.savedUsd.toFixed(4);
        engine.atcService.addLog('SYSTEM', `Estimated Gas Savings: ${pct}% | Saved Cost (USD): ${usd} | A=${econ.immediateTxCount}tx B=${econ.snapshotTxCount}tx (${reason})`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.SETTLEMENT_SUBMIT });
    }
};

const getGlobalDepositLimitSol = (_engine, agent) => {
    const envLimit = process.env.GLOBAL_DEPOSIT_SOL;
    if (envLimit !== undefined && envLimit !== null && String(envLimit).length > 0) return Number(envLimit);
    const initial = agent?.account?.initialBalance;
    if (typeof initial === 'number' && Number.isFinite(initial)) return Number(initial);
    return Number(LEX_CONSTITUTION?.ECONOMY?.INITIAL_BALANCE || 0) + Number(LEX_CONSTITUTION?.ECONOMY?.MIN_ESCROW || 0);
};

const enforceDepositBounds = async (engine, agent, meta = {}) => {
    const limit = getGlobalDepositLimitSol(engine, agent);
    const balance = Number(agent?.account?.balance ?? 0);
    const escrow = Number(agent?.account?.escrow ?? 0);
    const total = balance + escrow;
    const ok = balance >= 0 && escrow >= 0 && total <= limit;
    if (ok) return true;

    const reason = 'DEPOSIT_RANGE_VIOLATION';
    if (engine.atcService?.treasury?.applySlashing) {
        engine.atcService.treasury.applySlashing(agent, reason, meta);
    }

    await engine.atcService.recordEvent({
        shardId: meta.shardId || 'RG-0',
        shardEpoch: Number(meta.shardEpoch ?? 0),
        resourceId: meta.resourceId || null,
        fenceToken: meta.fenceToken || null,
        action: 'SETTLEMENT_DEPOSIT_VIOLATION',
        actorUuid: String(agent.uuid),
        correlationId: `settlement:deposit:${String(agent.uuid)}:${Date.now()}`,
        payload: { balance, escrow, total, limit, ...meta }
    }).catch(err => logger.error('[SettlementEngine] recordEvent error:', err));

    throw new Error(reason);
};

module.exports = {
    toLamports,
    emitGasEconomics,
    enforceDepositBounds,
};

