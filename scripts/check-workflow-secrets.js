const fs = require('fs');
const path = require('path');
const { readWorkflowSecretsPolicy } = require('./workflow-secrets-policy');

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
if (!fs.existsSync(workflowsDir)) process.exit(0);

const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
const foundByFile = new Map();

const extractWorkflowName = (raw) => {
  const lines = String(raw || '').split('\n');
  for (const line of lines) {
    const m = line.match(/^name:\s*(.+)\s*$/);
    if (!m) continue;
    let v = String(m[1] || '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }
    if (v) return v;
  }
  return null;
};

let policy;
try {
  const doc = readWorkflowSecretsPolicy();
  const map = new Map();
  for (const w of doc.workflows) {
    map.set(`${w.file}::${w.name}`, new Set(w.allowedSecrets));
  }
  policy = { map };
} catch (e) {
  process.stderr.write(`check-workflow-secrets failed:\n- cannot read docs/ops/workflow-secrets.json\n`);
  process.exit(1);
}

for (const f of files) {
  const p = path.join(workflowsDir, f);
  const raw = fs.readFileSync(p, 'utf8');
  const workflowName = extractWorkflowName(raw);
  const re = /\bsecrets\.([A-Z0-9_]+)\b/g;
  const keys = new Set();
  let m;
  while ((m = re.exec(raw))) {
    keys.add(m[1]);
  }
  foundByFile.set(f, { keys, workflowName });
}

const errors = [];
for (const file of files) {
  const entry = foundByFile.get(file);
  const workflowName = entry?.workflowName;
  if (!workflowName) {
    errors.push(`workflow ${file} missing top-level name`);
    continue;
  }
  const key = `${file}::${workflowName}`;
  if (!policy.map.has(key)) {
    errors.push(`missing allowlist entry for workflow ${key} in docs/ops/workflow-secrets.json`);
  }
}
for (const [file, data] of foundByFile.entries()) {
  const keys = data.keys;
  const workflowName = data.workflowName;
  if (!workflowName) continue;
  if (keys.size === 0) continue;
  const allowed = policy.map.get(`${file}::${workflowName}`);
  if (!allowed) {
    errors.push(`no allowlist for workflow ${file}::${workflowName} in docs/ops/workflow-secrets.json (found secrets: ${Array.from(keys).sort().join(', ')})`);
    continue;
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      errors.push(`workflow ${file}::${workflowName} uses forbidden secret ${key}`);
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(`check-workflow-secrets failed:\n- ${errors.join('\n- ')}\n`);
  process.exit(1);
}

process.stdout.write('check-workflow-secrets ok\n');
