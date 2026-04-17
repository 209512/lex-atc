const isTruthy = (value) => ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());

const isPlaceholderApiKey = (value) => {
    const key = String(value || '').trim();
    if (!key) return true;
    const normalized = key.toLowerCase();
    return normalized === 'sk-...' ||
        normalized === 'mock-api-key-123' ||
        normalized === 'change-me' ||
        normalized === 'your-api-key' ||
        normalized === 'your_api_key';
};

const shouldUseMockAI = () => isTruthy(process.env.USE_MOCK_AI);

const isAuthFailure = (error) => {
    const status = Number(error?.status || error?.statusCode || error?.code || 0);
    const message = String(error?.message || '').toLowerCase();
    return status === 401 ||
        status === 403 ||
        message.includes('401') ||
        message.includes('403') ||
        message.includes('unauthorized') ||
        message.includes('invalid api key') ||
        message.includes('authentication');
};

const buildMockResponse = ({ provider, model, prompt, systemInstruction, reason }) => {
    const label = String(provider || 'mock').toUpperCase();
    const modelName = String(model || 'Simulation');
    const userPart = String(prompt || '').slice(0, 80);
    const systemPart = systemInstruction ? 'Persona Active' : 'Default';
    const suffix = reason ? ` | Fallback: ${reason}` : '';
    return `Mock Response [${label}] ${modelName} | ${systemPart} | Prompt: ${userPart}${suffix}`;
};

module.exports = {
    isPlaceholderApiKey,
    shouldUseMockAI,
    isAuthFailure,
    buildMockResponse,
};

