// src/core/providers/GeminiProvider.js
const BaseProvider = require('./BaseProvider');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { shouldUseMockAI, isAuthFailure, buildMockResponse } = require('./providerRuntime');
const logger = require('../../utils/logger');

class GeminiProvider extends BaseProvider {
  async init() {
    if (shouldUseMockAI()) return;
    if (!this.config.apiKey) throw new Error('Gemini API Key required');
    this.genAI = new GoogleGenerativeAI(this.config.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: this.config.model || "gemini-pro" });
  }

  async generateResponse(prompt, systemInstruction) {
    if (shouldUseMockAI() || !this.model) {
        return buildMockResponse({
          provider: 'gemini',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: shouldUseMockAI() ? 'USE_MOCK_AI=true' : 'model_not_initialized'
        });
    }
    try {
      const fullPrompt = systemInstruction 
        ? `System: ${systemInstruction}\nUser: ${prompt}`
        : prompt;

      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      logger.error('Gemini Error:', error.message);
      if (isAuthFailure(error)) {
        return buildMockResponse({
          provider: 'gemini',
          model: this.config.model,
          prompt,
          systemInstruction,
          reason: 'api_auth_failure'
        });
      }
      return buildMockResponse({
        provider: 'gemini',
        model: this.config.model,
        prompt,
        systemInstruction,
        reason: error.message
      });
    }
  }
}

module.exports = GeminiProvider;
