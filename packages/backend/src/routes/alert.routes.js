const axios = require('axios');
const crypto = require('crypto');
const { validateBody } = require('../core/security/Validate');
const logger = require('../utils/logger');

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const requireAlertAuth = (req, res, next) => {
    const expected = String(process.env.ALERT_API_TOKEN || '');
    if (!expected) {
        return res.status(503).json({ error: 'ALERT_AUTH_NOT_CONFIGURED' });
    }

    const token = req.headers['authorization'];
    const presented = String(token || '');
    const expectedHeader = `Bearer ${expected}`;

    const ok = presented.length === expectedHeader.length &&
        crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expectedHeader));

    if (!token || !ok) {
        return res.status(401).json({ error: 'UNAUTHORIZED_ALERT_REQUEST' });
    }
    next();
};

const alertPayloadSchema = {
    alerts: { required: true, type: 'object' }
};

module.exports = function setupAlertRoutes(app, svc, middlewares) {
    const { globalRate } = middlewares;

    app.post('/api/alerts/slack', globalRate, requireAlertAuth, validateBody(alertPayloadSchema), asyncRoute(async (req, res) => {
        const slackUrl = process.env.SLACK_WEBHOOK_URL;
        if (!slackUrl) return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });

        const payload = req.body;
        const alerts = payload.alerts || [];
        
        for (const alert of alerts) {
            const severity = alert.labels?.severity || 'info';
            const color = severity === 'critical' ? '#E01E5A' : (severity === 'warning' ? '#ECB22E' : '#2EB67D');
            const emoji = severity === 'critical' ? '🚨' : (severity === 'warning' ? '⚠️' : 'ℹ️');

            const blockKitPayload = {
                text: `${emoji} ${alert.annotations?.summary || alert.labels?.alertname}`,
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: `${emoji} ${alert.labels?.alertname || 'ATC Alert'}`
                        }
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Severity:* \`${severity.toUpperCase()}\`\n*Summary:* ${alert.annotations?.summary || 'N/A'}\n\n*Details:*\n${alert.annotations?.description || 'No description provided.'}`
                        }
                    },
                    {
                        type: "actions",
                        elements: [
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Go to Dashboard"
                                },
                                url: process.env.FRONTEND_URL || 'https://lex-atc.local',
                                style: severity === 'critical' ? "danger" : "primary"
                            }
                        ]
                    }
                ]
            };

            try {
                await axios.post(slackUrl, blockKitPayload);
            } catch (err) {
                logger.error('[Slack Alert Proxy] Failed to send:', err.message);
            }
        }
        res.json({ success: true });
    }));

    app.post('/api/alerts/discord', globalRate, requireAlertAuth, validateBody(alertPayloadSchema), asyncRoute(async (req, res) => {
        const discordUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!discordUrl) return res.status(500).json({ error: 'DISCORD_WEBHOOK_URL not configured' });

        const payload = req.body;
        const alerts = payload.alerts || [];

        for (const alert of alerts) {
            const severity = alert.labels?.severity || 'info';
            const color = severity === 'critical' ? 14687834 : (severity === 'warning' ? 15512110 : 3066993);

            const embedPayload = {
                embeds: [
                    {
                        title: alert.labels?.alertname || 'ATC Alert',
                        description: `**Summary:** ${alert.annotations?.summary || 'N/A'}\n\n**Details:**\n${alert.annotations?.description || 'No description provided.'}`,
                        color: color,
                        fields: [
                            {
                                name: "Severity",
                                value: `\`${severity.toUpperCase()}\``,
                                inline: true
                            }
                        ],
                        url: process.env.FRONTEND_URL || 'https://lex-atc.local',
                        timestamp: alert.startsAt || new Date().toISOString()
                    }
                ]
            };

            try {
                await axios.post(discordUrl, embedPayload);
            } catch (err) {
                logger.error('[Discord Alert Proxy] Failed to send:', err.message);
            }
        }
        res.json({ success: true });
    }));
};
