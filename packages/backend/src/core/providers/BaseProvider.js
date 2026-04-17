// src/core/providers/BaseProvider.js
class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * Initialize the client
   */
  async init() {
    throw new Error('Method not implemented');
  }

  /**
   * Generate a response from the model
   * @param {string} prompt 
   * @param {string} systemInstruction 
   * @returns {Promise<string>}
   */
  async generateResponse(prompt, systemInstruction) {
    throw new Error('Method not implemented');
  }
}

module.exports = BaseProvider;
