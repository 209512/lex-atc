const fs = require('fs');
const path = require('path');
const { readWorkflowSecretsPolicy } = require('./workflow-secrets-policy');

const renderWorkflowSecretsMarkdown = () => {
  const policy = readWorkflowSecretsPolicy();
  const lines = [];
  lines.push('# Workflow Secrets (SSOT)');
  lines.push('');
  lines.push('SSOT: docs/ops/workflow-secrets.json');
  lines.push('Sync: node scripts/workflow-secrets-doc.js --sync');
  lines.push('');
  lines.push('| Workflow | Allowed secrets |');
  lines.push('|---|---|');
  for (const w of policy.workflows) {
    const key = `${w.file}::${w.name}`;
    const secrets = w.allowedSecrets.length ? w.allowedSecrets.map((s) => `\`${s}\``).join(', ') : '(none)';
    lines.push(`| ${key} | ${secrets} |`);
  }
  lines.push('');
  return lines.join('\n');
};

const mdPath = path.join(__dirname, '..', 'docs', 'ops', 'workflow-secrets.md');

const syncWorkflowSecretsMarkdown = () => {
  fs.writeFileSync(mdPath, `${renderWorkflowSecretsMarkdown()}\n`, 'utf8');
};

const checkWorkflowSecretsMarkdown = () => {
  const expected = `${renderWorkflowSecretsMarkdown()}\n`;
  const actual = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
  if (actual !== expected) {
    process.stderr.write('workflow-secrets.md out of date (run: node scripts/workflow-secrets-doc.js --sync)\n');
    process.exit(2);
  }
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--sync')) {
    syncWorkflowSecretsMarkdown();
    process.stdout.write('workflow-secrets.md synced\n');
    process.exit(0);
  }
  checkWorkflowSecretsMarkdown();
  process.stdout.write('workflow-secrets.md ok\n');
  process.exit(0);
}

module.exports = { renderWorkflowSecretsMarkdown, syncWorkflowSecretsMarkdown, checkWorkflowSecretsMarkdown };
