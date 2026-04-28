// src/core/providers/ProviderFactory.js
const OpenAIProvider = require('./OpenAIProvider');
const GeminiProvider = require('./GeminiProvider');
const AnthropicProvider = require('./AnthropicProvider');
const BaseProvider = require('./BaseProvider');
const { isPlaceholderApiKey, shouldUseMockAI, buildMockResponse } = require('./providerRuntime');
const logger = require('../../utils/logger');

class MockProvider extends BaseProvider {
    async init() { if (process.env.NODE_ENV !== 'test') logger.info('Mock Provider Initialized'); }
    async generateResponse(prompt, system) {
        const defaultDelay = 500 + Math.random() * 1000;
        const delay = process.env.MOCK_AI_DELAY !== undefined 
            ? Number(process.env.MOCK_AI_DELAY) 
            : defaultDelay;
            
        if (delay > 0) {
            await new Promise(r => setTimeout(r, delay));
        }
        return buildMockResponse({
            provider: this.config.provider || 'mock',
            model: this.config.model,
            prompt,
            systemInstruction: system,
            reason: this.config.mockReason || 'mock_mode'
        });
    }
}

class ProviderFactory {
  static create(type, agentConfig = {}) {
    const apiKeyMap = {
        openai: process.env.OPENAI_API_KEY,
        gemini: process.env.GEMINI_API_KEY,
        anthropic: process.env.ANTHROPIC_API_KEY
    };

    const config = {
        apiKey: apiKeyMap[type?.toLowerCase()] || null,
        model: agentConfig?.model || process.env.DEFAULT_MODEL || 'gpt-3.5-turbo',
        ...agentConfig
    };

    const providerType = type?.toLowerCase();
    const forceMock = shouldUseMockAI();
    const placeholderKey = isPlaceholderApiKey(config.apiKey);

    if (forceMock) {
        return new MockProvider({ ...config, provider: providerType || 'mock', mockReason: 'USE_MOCK_AI=true' });
    }

    if (!providerType || providerType === 'mock' || placeholderKey) {
        if (providerType !== 'mock' && placeholderKey) {
            if (process.env.NODE_ENV !== 'test') logger.warn(`⚠️ API Key missing for ${type}. Falling back to Mock.`);
        }
        return new MockProvider({ ...config, provider: providerType || 'mock', mockReason: 'placeholder_or_missing_api_key' });
    }
    
    switch (providerType) {
      case 'openai': return new OpenAIProvider(config);
      case 'gemini': return new GeminiProvider(config);
      case 'anthropic': return new AnthropicProvider(config);
      default: return new MockProvider({ ...config, provider: providerType || 'mock', mockReason: 'unsupported_provider' });
    }
  }
}

module.exports = ProviderFactory;
