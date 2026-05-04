# Workflow Secrets (SSOT)

SSOT: docs/ops/workflow-secrets.json
Sync: node scripts/workflow-secrets-doc.js --sync

| Workflow | Allowed secrets |
|---|---|
| cd.yml::CD Pipeline | `GITHUB_TOKEN`, `RELEASE_ENV_CMD`, `SOLANA_MAINNET_DEPLOY_KEY`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` |
| ci-combined.yml::CI Combined | (none) |

