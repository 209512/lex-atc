const fs = require('fs');
const path = require('path');
const { checkWorkflowSecretsMarkdown } = require('./workflow-secrets-doc');

const repoRoot = path.resolve(__dirname, '..');

const collectFiles = (dir) => {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectFiles(full));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
};

const isExternal = (u) =>
  /^https?:\/\//i.test(u) ||
  /^mailto:/i.test(u) ||
  /^tel:/i.test(u) ||
  /^#/i.test(u);

const stripAnchor = (u) => u.split('#')[0];

const checkFile = (filePath) => {
  const relFile = path.relative(repoRoot, filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  const problems = [];

  const linkRe = /\[[^\]]*?\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(content)) !== null) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    if (raw.startsWith('file:///')) problems.push({ link: raw, reason: 'forbidden file:/// link' });
    if (isExternal(raw)) continue;

    const cleaned = stripAnchor(raw);
    if (!cleaned) continue;
    if (cleaned.startsWith('javascript:')) continue;

    const resolved = cleaned.startsWith('/')
      ? path.join(repoRoot, cleaned)
      : path.resolve(path.dirname(filePath), cleaned);

    if (!fs.existsSync(resolved)) {
      problems.push({ link: raw, reason: `missing: ${path.relative(repoRoot, resolved)}` });
    }
  }

  return problems.map((p) => ({ file: relFile, ...p }));
};

const files = [
  path.join(repoRoot, 'README.md'),
  path.join(repoRoot, 'README.ko.md'),
  ...collectFiles(path.join(repoRoot, 'docs')),
  ...collectFiles(path.join(repoRoot, 'packages')),
].filter((p, i, a) => fs.existsSync(p) && a.indexOf(p) === i);

const allProblems = files.flatMap(checkFile);

if (allProblems.length) {
  for (const p of allProblems) {
    process.stderr.write(`${p.file}: ${p.reason}: ${p.link}\n`);
  }
  process.exit(2);
}

process.stdout.write(`doc-links: ok (${files.length} files)\n`);
checkWorkflowSecretsMarkdown();
process.exit(0);
