class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  async init() {
    throw new Error('Method not implemented');
  }

  async generateResponse(prompt, systemInstruction) {
    throw new Error('Method not implemented');
  }
}

module.exports = BaseProvider;
