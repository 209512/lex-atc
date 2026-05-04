## 변경 요약

- 

## 체크리스트

- [ ] 커밋/푸시/배포 관련 변경이 있으면 rollback 계획을 포함했다
- [ ] RELEASE_ENV_CMD / SECRETS_CMD 관련 변경이 있으면 Runbook 절차를 따랐다: docs/ops/runbook-secrets-and-release.md
- [ ] 워크플로우 파일을 추가/변경했다면 docs/ops/workflow-secrets.json을 갱신했다 (SSOT)
- [ ] 워크플로우에서 secrets.* 키를 추가했다면 allowlist 및 승인 정책을 업데이트했다
- [ ] pnpm -w verify를 통과했다
