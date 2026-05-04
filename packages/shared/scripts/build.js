const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pkgRoot = path.resolve(__dirname, '..');
const distDir = path.join(pkgRoot, 'dist');
const tmpDir = path.join(pkgRoot, 'dist-tmp');

const rm = (p) => {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
};

rm(tmpDir);

const tscPath = require.resolve('typescript/bin/tsc');
const res = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.json', '--outDir', 'dist-tmp'], {
  cwd: pkgRoot,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (res.status !== 0) process.exit(res.status || 1);

const required = [
  'index.js',
  'schemas.js',
  path.join('constants', 'economy.js'),
  path.join('constants', 'logConfig.js'),
  path.join('constants', 'logEvents.js'),
  path.join('constants', 'system.js'),
  path.join('types', 'statusSystem.js'),
];

for (const rel of required) {
  const abs = path.join(tmpDir, rel);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`shared build missing output: ${rel}\n`);
    process.exit(1);
  }
}

rm(distDir);
fs.renameSync(tmpDir, distDir);

