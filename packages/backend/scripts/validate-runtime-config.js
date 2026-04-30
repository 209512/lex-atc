const { loadBackendConfig } = require('../src/config/env');

try {
  loadBackendConfig(process.env);
  process.exit(0);
} catch (e) {
  process.stderr.write(String(e?.message || e));
  process.stderr.write('\n');
  process.exit(2);
}

