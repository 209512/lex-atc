# 배포 게이트(단일 소스)

목표: 배포 시점의 prod 환경변수로부터 동일한 입력을 받아, 배포 전에 invariant를 fail-fast로 검증한다.

## 표준 파이프라인 형태

1) 배포 도구가 제공하는 prod env를 JSON으로 출력  
2) 표준 키로 정규화: `jq -c -f scripts/release-env/normalize.jq`  
3) 검증: `pnpm release:check -- --stdin-json`

예시(개념):

```bash
<deploy-tool-export-prod-env-json> \
  | jq -c -f scripts/release-env/normalize.jq \
  | pnpm release:check -- --stdin-json
```

## 배포 도구 템플릿(예시)

### AWS SSM(개념)

```bash
present=false
aws ssm get-parameter --with-decryption --name /lex-atc/prod/ADMIN_TOKEN_SECRET >/dev/null 2>&1 && present=true
aws ssm get-parameters-by-path --with-decryption --recursive --path /lex-atc/prod \
  | jq -c --arg present "$present" '
      .Parameters
      | map({((.Name | split("/") | last)): .Value})
      | add
      | del(.ADMIN_TOKEN_SECRET)
      | . + {ADMIN_TOKEN_SECRET_PRESENT: $present}
    ' \
  | jq -c -f scripts/release-env/normalize.jq \
  | pnpm release:check -- --stdin-json
```

### Vault KV(개념)

```bash
present=false
vault kv get -field=ADMIN_TOKEN_SECRET secret/lex-atc/prod >/dev/null 2>&1 && present=true
vault kv get -format=json secret/lex-atc/prod \
  | jq -c --arg present "$present" '.data.data | del(.ADMIN_TOKEN_SECRET) | . + {ADMIN_TOKEN_SECRET_PRESENT: $present}' \
  | jq -c -f scripts/release-env/normalize.jq \
  | pnpm release:check -- --stdin-json
```

### Vercel env(개념)

```bash
vercel env pull --yes /dev/stdout --environment=production \
  | pnpm release:check -- --env-file /dev/stdin
```

## GitHub Actions/CD 적용

CD는 `RELEASE_ENV_CMD`가 JSON을 출력하도록 고정하고, exporter는 반드시 해당 커맨드만 실행하도록 구성한다:

- `REQUIRE_RELEASE_ENV_CMD=true`
- `RELEASE_ENV_CMD` (secret): `["/bin/sh","-lc","<deploy tool command> | jq -c -f scripts/release-env/normalize.jq"]`
- `REQUIRE_RELEASE_ENV_CMD=true` 모드에서는 exporter가 정규화된 JSON 키를 강제하며, `ADMIN_TOKEN_SECRET` 포함 시 실패한다.

## 보안 원칙

- `ADMIN_TOKEN_SECRET` 값 자체는 파이프/로그로 흘리지 않는다.
- 대신 `ADMIN_TOKEN_SECRET_PRESENT=true|false`만 전달해 “존재 여부”만 검증한다.
