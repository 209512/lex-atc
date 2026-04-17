// src/core/providers/NearAIProvider.js
const BaseProvider = require('./BaseProvider');
const OpenAI = require('openai');
const { shouldUseMockAI, isAuthFailure, buildMockResponse } = require('./providerRuntime');
const logger = require('../../utils/logger');

class NearAIProvider extends BaseProvider {
  async init() {
    if (shouldUseMockAI()) return;
    if (!this.config.apiKey) throw new Error('Near AI API Key required');
    
    // Near AI uses OpenAI SDK compatibility
    this.client = new OpenAI({ 
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || "https://api.near.ai/v1"
    });
  }

  async generateResponse(prompt, systemInstruction) {
    if (shouldUseMockAI() || !this.client) {
        return buildMockResponse({
          provider: 'nearai',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: shouldUseMockAI() ? 'USE_MOCK_AI=true' : 'client_not_initialized'
        });
    }
    try {
      const completion = await this.client.chat.completions.create({
        messages: [
            { role: "system", content: systemInstruction || "You are a helpful AI agent operating in a TEE." },
            { role: "user", content: prompt }
        ],
        model: this.config.model || "firefunction-v2", // Example Near AI model
      });
      return completion.choices[0].message.content;
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') logger.error('NearAI Error:', error.message);
      
      // Do not swallow actual API errors in production
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      
      // Fallback for development/testing
      if (isAuthFailure(error)) {
        return buildMockResponse({
          provider: 'nearai',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: 'api_auth_failure'
        });
      }
      return buildMockResponse({
        provider: 'nearai',
        model: this.config.model,
        prompt,
        systemInstruction,
        reason: error.message
      });
    }
  }
}

module.exports = NearAIProvider;
