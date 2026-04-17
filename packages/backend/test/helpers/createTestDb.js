const createTestDb = async (prefix = 't') => {
  jest.resetModules();
  process.env.DB_MODE = 'memory';
  process.env.DB_MEMORY_NAMESPACE = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const db = require('../../src/core/DatabaseManager');
  await db.init();
  return db;
};

module.exports = { createTestDb };

