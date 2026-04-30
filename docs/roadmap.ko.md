# 로드맵 & 알려진 한계

이 문서는 “아직 프로덕션급이 아닌 영역”과 개선 계획을 추적한다.

## 알려진 한계

- 경제적 원자성: end-to-end Outbox + deterministic replay가 엄격하게 강제되지 않음  
  현재: 이벤트는 버퍼링 후 비동기로 flush되며, replay는 “단일 소스 오브 트루스”가 아니라 best-effort 복구에 가깝다.  
  목표: 경제적으로 중요한 변경은 outbox에 append-only로 기록되고, deterministic replay가 상태 전이의 기준이 된다.  
  참고: [flushEventBuffer](../packages/backend/src/core/DatabaseManager.js#L145-L190), [appendEvent](../packages/backend/src/core/DatabaseManager.js#L220-L252), [replayToHazelcast](../packages/backend/src/core/DatabaseManager.js#L278-L353), [recovery.integration.test.js](../packages/backend/test/integration/recovery.integration.test.js#L1-L92)
- hostile takeover 에스크로 내구성: takeover escrow가 인메모리로 관리되어 재시작을 넘는 영속화가 아직 부족  
  현재: 에스크로는 메모리에 존재하고 런타임에서 지급/환불되며, 재시작 시 in-flight 상태가 유실될 수 있다.  
  목표: 에스크로를 영속화하고 idempotent 정산/복구를 제공해 재시작에서도 유실/중복 적용이 발생하지 않게 한다.  
  참고: [executeHostileTakeover](../packages/backend/src/core/LockDirector.js#L207-L236), [transfer timeout escrow rollback](../packages/backend/src/core/LockDirector.js#L163-L205), [escrow payout on acquire](../packages/backend/src/services/atc.service.js#L396-L434)
- Utility/Entropy 스케줄링: 측정 가능한 utility/entropy 신호 기반 스케줄링은 R&D 트랙이며 안정 정책이 아님  
  현재: tickets/bids가 순서를 결정하며, entropy는 현재 정책 입력이 아니라 시각화/리스크 축에 가깝다.  
  목표: 감사 가능한 utility/entropy 신호가 스케줄링에 영향을 주되, 지표/임계값/재현 가능한 결정 규칙을 갖춘다.  
  현재 큐/입찰 정책: [ensureTicket](../packages/backend/src/core/TicketManager.js#L10-L39), [cancelTicket](../packages/backend/src/core/TicketManager.js#L41-L65), [collectEscrowBid](../packages/backend/src/core/TicketManager.js#L99-L106)  
  Entropy 신호(현재는 시각화/리스크 축): [computeRiskVector entropy axis](../packages/frontend/src/mocks/core/physics.ts#L35-L58)
- 스테이트 채널 코디네이터: 채널 라이프사이클(머클 스냅샷, dispute window 등) 오케스트레이션이 완전하지 않음  
  현재: snapshots/disputes는 존재하지만, 주기적 스냅샷과 dispute window를 end-to-end로 강제하는 coordinator가 없다.  
  목표: coordinator가 스냅샷 주기, dispute/challenge 윈도우, 최종화 규칙을 소유하고 복구 가능한 전이를 제공한다.  
  현재 채널 영속화: [upsertChannel](../packages/backend/src/core/db/repositories/ChannelRepository.js#L21-L62), [insertChannelSnapshot](../packages/backend/src/core/db/repositories/ChannelRepository.js#L74-L182), [insertDispute](../packages/backend/src/core/db/repositories/ChannelRepository.js#L184-L219)  
  현재 정산 런타임: [snapshot creation](../packages/backend/src/core/settlement/SettlementEngine.js#L383-L470), [openDispute](../packages/backend/src/core/settlement/SettlementEngine.js#L680-L714)  
  Anchor 프로그램: [submit_snapshot](../packages/contracts/programs/lex_atc_settlement/src/lib.rs#L12-L95), [open_dispute](../packages/contracts/programs/lex_atc_settlement/src/lib.rs#L97-L110)

## 로드맵

- hostile takeover 에스크로를 Redis/Postgres/Hazelcast 등에 영속화하고 크래시 세이프 복구 추가  
  예상 연동 지점: [executeHostileTakeover](../packages/backend/src/core/LockDirector.js#L207-L236), [appendEvent](../packages/backend/src/core/DatabaseManager.js#L220-L252)
- 경제 시스템을 Outbox + deterministic replay 기반으로 업그레이드  
  이벤트 파이프라인 기반: [flushEventBuffer](../packages/backend/src/core/DatabaseManager.js#L145-L190), [appendEvent](../packages/backend/src/core/DatabaseManager.js#L220-L252), [replayToHazelcast](../packages/backend/src/core/DatabaseManager.js#L278-L353)
- 주기적 스냅샷 및 dispute/challenge 윈도우를 관리하는 채널 코디네이터 추가  
  채널 모델 기반: [ChannelRepository](../packages/backend/src/core/db/repositories/ChannelRepository.js#L21-L219)
- 측정 가능/감사 가능한 스케줄링 신호(utility/entropy)와 평가 기준 도입  
  현재 스케줄링 입력: tickets/bids in [TicketManager](../packages/backend/src/core/TicketManager.js#L10-L107)
