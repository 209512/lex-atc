const fs = require('fs');
const path = require('path');

const readWorkflowSecretsPolicy = () => {
  const p = path.join(__dirname, '..', 'docs', 'ops', 'workflow-secrets.json');
  const raw = fs.readFileSync(p, 'utf8');
  const doc = JSON.parse(raw);
  const workflows = Array.isArray(doc?.workflows) ? doc.workflows : [];
  const normalized = [];
  for (const w of workflows) {
    const file = String(w?.file || '').trim();
    const name = String(w?.name || '').trim();
    const allowedSecrets = Array.isArray(w?.allowedSecrets) ? w.allowedSecrets.map((s) => String(s)).filter(Boolean) : [];
    if (!file || !name) continue;
    normalized.push({ file, name, allowedSecrets: Array.from(new Set(allowedSecrets)).sort() });
  }
  normalized.sort((a, b) => `${a.file}::${a.name}`.localeCompare(`${b.file}::${b.name}`));
  return { version: Number(doc?.version || 1), workflows: normalized };
};

module.exports = { readWorkflowSecretsPolicy };

