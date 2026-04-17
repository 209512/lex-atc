// src/config/hazelcast.config.js
const fs = require('fs');
const path = require('path');
const { loadBackendConfig } = require('./env');

const getHazelcastConfig = (agentIdOrName = 'ATC-Client') => {
  const cfg = loadBackendConfig(process.env);
  const isLocalEnv = Boolean(cfg.hazelcast.useLocal);

  const config = {
    clusterName: cfg.hazelcast.clusterName,
    network: {
      connectionTimeout: cfg.hazelcast.timeouts.connectionTimeoutMs
    },
    properties: {
      'hazelcast.client.heartbeat.interval': cfg.hazelcast.timeouts.heartbeatIntervalMs,
      'hazelcast.client.heartbeat.timeout': cfg.hazelcast.timeouts.heartbeatTimeoutMs,
      'hazelcast.client.invocation.timeout.millis': cfg.hazelcast.timeouts.invocationTimeoutMs,
      'hazelcast.client.cloud.url': cfg.hazelcast.cloudUrl
    },
    connectionStrategy: {
        reconnectMode: 'ON',
        connectionRetry: {
            initialBackoffMillis: cfg.hazelcast.timeouts.retryInitialBackoffMs,
            maxBackoffMillis: cfg.hazelcast.timeouts.retryMaxBackoffMs,
            multiplier: cfg.hazelcast.timeouts.retryMultiplier,
            clusterConnectTimeoutMillis: cfg.hazelcast.timeouts.clusterConnectTimeoutMs
        }
    }
  };

  if (!isLocalEnv && cfg.hazelcast.discoveryToken) {
    config.network.hazelcastCloud = {
      discoveryToken: cfg.hazelcast.discoveryToken
    };
    config.network.ssl = {
      enabled: true,
      sslOptions: {
        key: fs.readFileSync(cfg.hazelcast.certKeyPath || path.join(__dirname, '../../certs/client-key.pem')),
        cert: fs.readFileSync(cfg.hazelcast.certPath || path.join(__dirname, '../../certs/client-cert.pem')),
        ca: fs.readFileSync(cfg.hazelcast.caPath || path.join(__dirname, '../../certs/ca-cert.pem')),
        rejectUnauthorized: cfg.nodeEnv === 'production',
        passphrase: cfg.hazelcast.password
      }
    };
  } else {
    config.network.clusterMembers = cfg.hazelcast.address;
    config.network.ssl = {
      enabled: false
    };
  }

  return config;
};

module.exports = getHazelcastConfig;
