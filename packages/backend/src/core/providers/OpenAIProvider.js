// src/core/providers/OpenAIProvider.js
const BaseProvider = require('./BaseProvider');
const OpenAI = require('openai');
const { shouldUseMockAI, isAuthFailure, buildMockResponse } = require('./providerRuntime');
const logger = require('../../utils/logger');

class OpenAIProvider extends BaseProvider {
  async init() {
    if (shouldUseMockAI()) return;
    if (!this.config.apiKey) throw new Error('OpenAI API Key required');
    this.client = new OpenAI({ apiKey: this.config.apiKey });
  }

  async generateResponse(prompt, systemInstruction) {
    if (shouldUseMockAI() || !this.client) {
        return buildMockResponse({
          provider: 'openai',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: shouldUseMockAI() ? 'USE_MOCK_AI=true' : 'client_not_initialized'
        });
    }
    try {
      const completion = await this.client.chat.completions.create({
        messages: [
            { role: "system", content: systemInstruction || "You are a helpful AI agent." },
            { role: "user", content: prompt }
        ],
        model: this.config.model || "gpt-3.5-turbo",
      });
      return completion.choices[0].message.content;
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') logger.error('OpenAI Error:', error.message);
      
      // Do not swallow actual API errors in production
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      
      // Fallback for development/testing
      if (isAuthFailure(error)) {
        return buildMockResponse({
          provider: 'openai',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: 'api_auth_failure'
        });
      }
      return buildMockResponse({
        provider: 'openai',
        model: this.config.model,
        prompt,
        systemInstruction,
        reason: error.message
      });
    }
  }
}

module.exports = OpenAIProvider;
