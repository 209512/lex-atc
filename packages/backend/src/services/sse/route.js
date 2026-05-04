const { buildWirePayload, logsSince } = require('./payload');

module.exports = async function handleStream(sse, req, res, next) {
    try {
        if (sse.sseClients.size >= sse.MAX_SSE_CLIENTS) {
            return res.status(503).json({ error: 'TOO_MANY_CONNECTIONS' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        sse.sseClients.add(res);

        const lastEventId = String(req.headers['last-event-id'] || '');
        const agents = await sse.svc.getAgentStatus({ includePosition: false });
        const logs = logsSince(sse, lastEventId);
        const state = {
            ...sse.svc.state,
            contractVersion: 1,
            sse: { serverTime: Date.now() },
            logs
        };
        const eventId = (logs.length > 0 ? logs[logs.length - 1].id : (sse.lastSentLogId || `t-${Date.now()}`));
        const wire = buildWirePayload(sse, { agents, state, eventId });
        if (!wire) return;
        sse.lastWire = wire;
        res.write(wire);

        req.on('close', () => {
            sse.sseClients.delete(res);
        });
    } catch (err) {
        next(err);
    }
};

