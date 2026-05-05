# 아키텍처

lex-atc는 UI(L4)와 백엔드 런타임(L1~L3)을 분리해 운영하는 구조를 기본으로 한다.

## 모드별 흐름

```mermaid
flowchart LR
  U[Frontend UI] -->|/api requests| A{Mode}
  A -->|Standalone| M[MSW Worker]
  M --> S[Simulation DB/Handlers]
  A -->|Backend| B[Backend API]
  U -->|SSE /api/stream| E{Mode}
  E -->|Standalone| M
  E -->|Backend| B
```

## 운영 요청 흐름

```mermaid
sequenceDiagram
  participant UI as Frontend UI
  participant API as Backend API
  participant GOV as Governance
  participant ISO as Isolation
  participant SET as Settlement
  participant HIS as History (DB/Events)
  UI->>API: Operator action (REST)
  API->>GOV: Validate/authorize & create proposal
  GOV-->>ISO: Queue/guard execution (optional)
  GOV-->>SET: Dispute/slash/settle (optional)
  GOV-->>HIS: Append audit events
  SET-->>HIS: Append settlement traces
  API-->>UI: SSE stream updates
```

## 레이어

- L4: React/Vite 기반 모니터링·운영 UI
- L1: [Lock](./glossary.md#lock)/Sequencer/정책 실행 계층(Hazelcast/FencedLock 등)
- L2: 이벤트/스냅샷/감사로그 저장(Postgres/Redis)
- L3: [Settlement](./glossary.md#settlement)/[Dispute](./glossary.md#dispute)/서명·증명(Solana/Anchor, 로컬은 Mock adapter)

## 패키지

- `packages/frontend`: UI, 운영 패널, MSW 기반 Standalone simulation
- `packages/backend`: API/[SSE](./glossary.md#sse), 런타임(agents/governance/isolation/settlement)
- `packages/contracts`: Solana Anchor 프로그램/테스트
- `packages/shared`: 공용 타입/스키마
- `services/ml-watcher`: 이상행동 감지(옵션)

## 메모

- Standalone(MSW) 모드는 데모/시뮬레이션에 최적화된 모드이며, 운영 환경의 권한·지연·실패 패턴을 1:1 재현하지 않는다.
- Backend mode는 실제 운영 리스크를 검증하는 모드이며, 운영 배포 전 반드시 이 모드에서 확인하는 것을 권장한다.

## 전체 시스템 다이어그램(개념)

```mermaid
graph TD
    subgraph L4["L4 Monitoring · React 18 + React Router + Context"]
        UI[Sidebar / Tactical Panels]
        HUD[2D RadarLite / Floating Windows]
        Analytics[Terminal Analytics / Event Logs]
        Store[ATC Provider + UI Preferences Storage]
        UI --> Store
        HUD --> Store
        Analytics --> Store
    end

    subgraph L1["L1 Execution · Hazelcast CP + Sharded Sequencer"]
        HZ[Hazelcast CP Subsystem]
        FS[FencedLock]
        SS[Sharded Sequencer]
        PM[PolicyManager]
        LD[LockDirector]
    end

    subgraph Runtime["Autonomous Runtime · Node.js"]
        API[ATC Service / Express API]
        AM[AgentManager]
        AG[Autonomous Agents]
        ISO[Isolation Policy Engine]
        GOV[Governance Engine]
        TR[Treasury]
    end

    subgraph L2["L2 History · PostgreSQL"]
        DB[(Event Logs / Snapshots / Channel State)]
        REDIS[(Redis Pub/Sub - optional/HA)]
    end

    subgraph L3["L3 Settlement · Runtime + Anchor"]
        SET["Settlement Engine (on-chain optional)"]
        ML["AI Watcher API (optional)"]
        CH["Channel Snapshots / Signatures (optional)"]
    end

    Store <-->|SSE Stream| API
    UI -->|REST / Control| API
    Store <-->|SSE fanout - optional| REDIS

    API --> AM
    API --> LD
    API --> GOV
    API --> ISO
    API --> TR
    API --> SET

    AM --> AG
    AG --> PM
    AG --> SS
    AG --> FS
    HZ --> FS
    HZ --> SS

    PM -->|economic gate: bid / priority / forced candidate| AG
    AG -->|entry fee / reward / slashing| TR
    LD -->|takeover / forced transfer| TR
    TR -->|economic events| DB
    TR -->|settlement triggers| SET
    SET -->|anomaly detection| ML
    API -->|SSE publish - optional| REDIS

    API -->|audit events / snapshots| DB
    ISO -->|task events| DB
    GOV -->|admin audit events| DB
    SET --> CH
    CH --> DB
```

- Redis Pub/Sub은 단일 인스턴스에서는 필수 구성은 아니며, 다중 인스턴스/SSE 퍼블리셔 리더십을 위해 권장되는 선택 구성이다.
- On-chain(Anchor/메인넷)은 운영 환경변수로 활성화되는 선택 구성이고, 로컬/테스트에서는 Mock adapter로 동작할 수 있다.
- ML Watcher는 `ML_INFERENCE_API_URL`이 설정된 경우에만 외부 API 호출을 수행하는 선택 구성이다.

### 옵션 구성 활성화 조건(ENV)

| 옵션 | 의미 | 활성화 조건(대표 ENV) |
| --- | --- | --- |
| Redis Pub/Sub | 다중 인스턴스에서 SSE fanout/리더십을 지원 | `REDIS_URL` 또는 `REDIS_SENTINELS` |
| ML Watcher | 정산/분쟁 관련 외부 추론 API 호출 | `ML_INFERENCE_API_URL` |
| On-chain settlement | 실제 Solana/Anchor 트랜잭션 수행 | `SOLANA_SETTLEMENT_ENABLED=true` + `SOLANA_RPC_URL` (+ `SOLANA_PROGRAM_ID` 등) |
