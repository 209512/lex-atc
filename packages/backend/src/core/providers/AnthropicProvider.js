// src/core/providers/AnthropicProvider.js
const BaseProvider = require('./BaseProvider');
const Anthropic = require('@anthropic-ai/sdk');
const { shouldUseMockAI, isAuthFailure, buildMockResponse } = require('./providerRuntime');
const logger = require('../../utils/logger');

class AnthropicProvider extends BaseProvider {
  async init() {
    if (shouldUseMockAI()) return;
    if (!this.config.apiKey) throw new Error('Anthropic API Key required');
    this.client = new Anthropic({ apiKey: this.config.apiKey });
  }

  async generateResponse(prompt, systemInstruction) {
    if (shouldUseMockAI() || !this.client) {
        return buildMockResponse({
          provider: 'anthropic',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: shouldUseMockAI() ? 'USE_MOCK_AI=true' : 'client_not_initialized'
        });
    }
    try {
      const msg = await this.client.messages.create({
        model: this.config.model || "claude-3-opus-20240229",
        max_tokens: 1024,
        system: systemInstruction,
        messages: [
          { role: "user", content: prompt }
        ]
      });
      return msg.content[0].text;
    } catch (error) {
      logger.error('Anthropic Error:', error.message);
      if (isAuthFailure(error)) {
        return buildMockResponse({
          provider: 'anthropic',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: 'api_auth_failure'
        });
      }
      return buildMockResponse({
        provider: 'anthropic',
        model: this.config.model,
        prompt,
        systemInstruction,
        reason: error.message
      });
    }
  }
}

module.exports = AnthropicProvider;
