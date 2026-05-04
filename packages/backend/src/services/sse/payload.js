const { SseEventContractSchema } = require('@lex-atc/shared');

const contractMode = () => String(process.env.CONTRACT_MODE || 'warn').toLowerCase();

const buildWirePayload = (sse, { agents, state, eventId }) => {
    const payload = { agents, state };
    const parsed = SseEventContractSchema.safeParse(payload);
    if (!parsed.success) {
        const mode = contractMode();
        try { sse.contractViolations.inc({ channel: 'sse', schema: 'SseEventContractSchema', mode }); } catch {}
        if (mode === 'enforce') return null;
    }
    const dataStr = JSON.stringify(payload);
    const id = eventId || '0';
    return `id: ${id}\ndata: ${dataStr}\n\n`;
};

const logsSince = (sse, lastEventId) => {
    const allLogs = sse.svc.state.logs || [];
    if (!lastEventId) return allLogs.slice(-100);
    const lastIdx = allLogs.findIndex(l => String(l.id) === String(lastEventId));
    if (lastIdx !== -1) return allLogs.slice(lastIdx + 1);
    return allLogs.slice(-100);
};

module.exports = {
    contractMode,
    buildWirePayload,
    logsSince,
};

