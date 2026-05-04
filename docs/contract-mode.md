# 계약 모드(warn → enforce)

## 목표
- API/SSE 계약(스키마) 회귀를 조기에 탐지
- 관측 중심(`warn`)에서 fail-fast(`enforce`)로 안전하게 전환

## 제어
- `CONTRACT_MODE`
  - `warn`(기본): payload를 검증하고 메트릭/로그를 남기되, 서비스는 계속 응답
  - `enforce`: 잘못된 응답을 거부하거나 잘못된 SSE publish를 생략(fail-fast)

## 검증 위치
- SSE publish 경로
  - 서버가 클라이언트/Redis로 쓰기 전에 SSE payload를 검증
  - 메트릭: `lex_atc_contract_validation_failures_total{channel="sse",schema="SseEventContractSchema",mode=...}`
- REST 응답(선별된 엔드포인트)
  - 응답 직전에 JSON을 검증

## 권장 전개(warn → enforce)
- 1단계: Production `CONTRACT_MODE=warn`
  - `lex_atc_contract_validation_failures_total` 증가율이 0이 아닌 경우 알림
  - 위반 payload를 만드는 producer를 먼저 수정
- 2단계: Staging `CONTRACT_MODE=enforce`
  - 충분한 관측 구간 동안 위반이 없는지 확인
  - UI/E2E 등 클라이언트 회귀가 없는지 확인
- 3단계: Production `CONTRACT_MODE=enforce`
  - 동일 알림을 유지해 회귀를 즉시 탐지

## 관련 보안/운영 토글
- CSRF
  - `CSRF_ENFORCE_ALL_UNSAFE=true`를 켜면 unsafe 요청 전반에 CSRF 토큰을 강제
- SSE 리더 fallback
  - production에서는 Redis 미구성/장애 시 기본 fail-closed로 publish가 멈춘다
  - 단일 인스턴스/개발에서만 `SSE_UNSAFE_SINGLE_INSTANCE_FALLBACK=true`로 로컬 퍼블리셔를 허용
- SSE staleness(프론트)
  - `VITE_SSE_STALE_MS`는 TCP 연결이 살아 있어도 “업데이트가 멈춘 상태”로 판단하는 기준
  - 인그레스/로드밸런서 idle timeout 및 예상 업데이트 주기에 맞춰 튜닝 권장
  - 시작값 가이드(인프라에 맞게 검증)
    - 경험칙: `VITE_SSE_STALE_MS` ≈ min(idle-timeout - 5s, max(reconnectMs * 5, 10s))
    - Nginx proxy_read_timeout: 종종 60s → 45s부터 시작
    - AWS ALB idle timeout: 종종 60s → 45s부터 시작
    - Cloudflare(플랜별 상이): 25s부터 시작 후 조정
    - Render/매니지드(상이): 25s부터 시작 후 조정
- Sandbox allowlist
  - `SANDBOX_ALLOWED_BINARIES=/bin/echo` (comma-separated allowlist)
  - `SANDBOX_COMMAND_POLICY_JSON` (optional): per-command policy overrides (roles/classifications/timeout)
    - 예시:
      - `{"ECHO":{"requiredRoles":["executor"],"allowedClassifications":["irreversible"],"timeoutMs":1000,"auditRequired":true}}`
    - 관측:
      - `lex_atc_sandbox_policy_denials_total{reason="SANDBOX_BINARY_NOT_ALLOWED",command_key="ECHO"}`

## Settlement 계약 체크
- Settlement 작업은 chain metadata를 항상 포함하도록 강제(chain + mock)
  - `txid`, `commitment`, `status`를 필수로 요구
  - 메트릭: `lex_atc_settlement_contract_failures_total{op="openDispute|slash",reason="SETTLEMENT_CHAIN_METADATA_MISSING"}`

## Alerting
- 권장 규칙
  - `increase(lex_atc_settlement_contract_failures_total{reason="SETTLEMENT_CHAIN_METADATA_MISSING"}[1m]) > 0`
  - Sandbox (non-benign)
    - `increase(lex_atc_sandbox_policy_denials_total{reason!~"SANDBOX_FORBIDDEN|SANDBOX_NOT_FINALIZED"}[1m]) > 0`
    - 포함 예: `SANDBOX_BINARY_NOT_ALLOWED`(allowlist 위반), `SANDBOX_POLICY_PARSE_ERROR`, `SANDBOX_COMMAND_KEY_UNKNOWN`
  - Sandbox (forbidden spike)
    - `increase(lex_atc_sandbox_policy_denials_total{reason="SANDBOX_FORBIDDEN"}[${SANDBOX_FORBIDDEN_SPIKE_WINDOW:-5m}]) > ${SANDBOX_FORBIDDEN_SPIKE_THRESHOLD:-20}`
    - 환경별(prod/staging)로 Grafana provisioning 환경변수 `SANDBOX_FORBIDDEN_SPIKE_WINDOW`, `SANDBOX_FORBIDDEN_SPIKE_THRESHOLD` 값을 확정해 고정
