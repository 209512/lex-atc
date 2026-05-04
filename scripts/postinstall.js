const { spawnSync } = require('child_process');

const skip = String(process.env.LEX_ATC_SKIP_NATIVE_REBUILD || '').toLowerCase() === 'true';
if (skip) process.exit(0);

const res = spawnSync('pnpm', ['rebuild', 'bigint-buffer'], { stdio: 'inherit' });
if (res.status !== 0) {
  process.stderr.write('postinstall: native rebuild skipped (bigint-buffer)\n');
  process.exit(0);
}

