// backend/src/core/HazelcastManager.js
const { Client } = require('hazelcast-client');
const getHazelcastConfig = require('../config/hazelcast.config');
const CONSTANTS = require('../config/constants');
const { loadBackendConfig } = require('../config/env');
const { FakeHazelcastClient } = require('../testkit/FakeHazelcast');
const logger = require('../utils/logger');

class HazelcastManager {
  constructor() {
    this.client = null;
    this.cpSubsystem = null;
    this.sessionService = null;
    this.map = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  async init() {
      if (this.isInitialized) return this.client;
      if (this.initPromise) return this.initPromise;
      const cfg = loadBackendConfig(process.env);

          this.initPromise = new Promise((resolve, reject) => {
              if (cfg.hazelcast.useLocal || String(process.env.USE_LOCAL_HZ || '').toLowerCase() === 'true') {
                    if (process.env.NODE_ENV !== 'test') {
                        logger.warn('⚠️ [HZ-FALLBACK] Using in-memory Hazelcast client (USE_LOCAL_HZ=true).');
                    }
                    this.client = new FakeHazelcastClient();
                  this.cpSubsystem = this.client.getCPSubsystem();
                  this.client.getMap(CONSTANTS.MAP_ATC_METADATA).then(map => {
                      this.map = map;
                      this.sessionService = null;
                      this.isInitialized = true;
                      resolve(this.client);
                  });
                  return;
              }

              let attempts = 0;
              const tryConnect = async () => {
                  try {
                      logger.info(`🔌 [HZ-CONNECT] Attempt ${attempts + 1}/${CONSTANTS.HZ_MAX_RETRIES}...`);
                      const config = getHazelcastConfig('ATC-Admin');
                      this.client = await Client.newHazelcastClient(config);
                      
                      this.cpSubsystem = this.client.getCPSubsystem();
                      this.map = await this.client.getMap(CONSTANTS.MAP_ATC_METADATA);
                      this.sessionService = typeof this.client.getLifecycleService === 'function'
                        ? this.client.getLifecycleService()
                        : null;
                      
                      this.isInitialized = true;
                      logger.info('✅ [HZ-READY] Hazelcast Connected.');
                      resolve(this.client);
                  } catch (err) {
                      attempts++;
                      logger.error(`❌ [HZ-RETRY] Failed: ${err.message}`);
                      if (attempts >= CONSTANTS.HZ_MAX_RETRIES) {
                          if (cfg.nodeEnv !== 'production') {
                              logger.warn('⚠️ [HZ-FALLBACK] Using in-memory Hazelcast client for local development.');
                              this.client = new FakeHazelcastClient();
                              this.cpSubsystem = this.client.getCPSubsystem();
                              this.map = await this.client.getMap(CONSTANTS.MAP_ATC_METADATA);
                              this.sessionService = null;
                              this.isInitialized = true;
                              resolve(this.client);
                              return;
                          }
                          reject(err);
                          return;
                      }
                      // Non-blocking wait before retry
                      setTimeout(tryConnect, CONSTANTS.HZ_CONNECT_RETRY_MS);
                  }
              };
              
              // Start connection attempt asynchronously without blocking
              setImmediate(tryConnect);
          });

          try {
              return await this.initPromise;
          } catch (e) {
              this.initPromise = null;
              throw e;
          }
  }

  getClient() {
    if (!this.isInitialized) {
      logger.warn('⚠️ HazelcastManager accessed before initialization. Call init() first.');
    }
    return this.client;
  }

  getCPSubsystem() {
    if (!this.isInitialized) throw new Error('HazelcastManager not initialized');
    return this.cpSubsystem;
  }

  getSessionService() {
    if (!this.isInitialized) return null;
    return this.sessionService;
  }

  async getMetadataMap() {
    if (!this.isInitialized) throw new Error('HazelcastManager not initialized');
    return this.map;
  }

  async shutdown() {
    if (this.client) {
      try {
          await this.client.shutdown();
      } catch (e) {
          logger.error('Error shutting down Hazelcast client:', e.message);
      }
      this.isInitialized = false;
      this.client = null;
      this.cpSubsystem = null;
      this.map = null;
      this.sessionService = null;
      this.initPromise = null;
      logger.info('🔌 Hazelcast Shared Client Disconnected.');
    }
  }
}

module.exports = new HazelcastManager();
