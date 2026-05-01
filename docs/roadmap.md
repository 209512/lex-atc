# Roadmap & Known Limitations

This file tracks what is *not yet production-grade* and what we plan to improve.

## Known Limitations

- Economic atomicity: strict Outbox + deterministic replay is not enforced end-to-end yet  
  Current: events are buffered and flushed asynchronously; replay is best-effort reconstruction rather than a single source of truth.  
  Target: every economy-critical mutation is driven by an append-only outbox with deterministic replay as the canonical state transition mechanism.  
  Pointers: [flushEventBuffer](../packages/backend/src/core/DatabaseManager.js#L145-L190), [appendEvent](../packages/backend/src/core/DatabaseManager.js#L220-L252), [replayToHazelcast](../packages/backend/src/core/DatabaseManager.js#L278-L353), [recovery.integration.test.js](../packages/backend/test/integration/recovery.integration.test.js#L1-L92)
- Hostile takeover escrow durability: takeover escrow is in-memory and not fully persisted across process restarts  
  Current: escrow exists in memory and is paid/refunded at runtime; a restart can lose in-flight escrow state.  
  Target: escrow is persisted with idempotent reconciliation so restart recovery cannot lose or double-apply funds.  
  Pointers: [executeHostileTakeover](../packages/backend/src/core/LockDirector.js#L207-L236), [transfer timeout escrow rollback](../packages/backend/src/core/LockDirector.js#L163-L205), [escrow payout on acquire](../packages/backend/src/services/atc.service.js#L396-L434)
- Utility/Entropy scheduling: scheduling based on measurable utility/entropy signals is R&D, not a stable policy  
  Current: tickets/bids drive ordering; entropy-based signals are not wired into policy decisions yet.  
  Target: auditable utility/entropy signals influence scheduling with clear metrics, thresholds, and replayable decisions.  
  Current queue/bid policy: [ensureTicket](../packages/backend/src/core/TicketManager.js#L10-L39), [cancelTicket](../packages/backend/src/core/TicketManager.js#L41-L65), [collectEscrowBid](../packages/backend/src/core/TicketManager.js#L99-L106)  
  Entropy signal (placeholder): planned as a measurable, auditable signal (see Target)
- State channel coordinator: full channel lifecycle orchestration (Merkle snapshots, dispute windows) is not complete yet  
  Current: snapshots/disputes exist, but there is no coordinator that enforces periodic snapshotting and dispute windows end-to-end.  
  Target: a coordinator owns snapshot cadence, dispute/challenge windows, and finalization rules with recovery-safe state transitions.  
  Current channel persistence: [upsertChannel](../packages/backend/src/core/db/repositories/ChannelRepository.js#L21-L62), [insertChannelSnapshot](../packages/backend/src/core/db/repositories/ChannelRepository.js#L74-L182), [insertDispute](../packages/backend/src/core/db/repositories/ChannelRepository.js#L184-L219)  
  Current settlement runtime: [snapshot creation](../packages/backend/src/core/settlement/SettlementEngine.js#L383-L470), [openDispute](../packages/backend/src/core/settlement/SettlementEngine.js#L680-L714)  
  Anchor program: [submit_snapshot](../packages/contracts/programs/lex_atc_settlement/src/lib.rs#L12-L95), [open_dispute](../packages/contracts/programs/lex_atc_settlement/src/lib.rs#L97-L110)

## Roadmap

- Persist hostile takeover escrow (Redis/Postgres/Hazelcast) and add crash-safe reconciliation  
  Target integration points: [executeHostileTakeover](../packages/backend/src/core/LockDirector.js#L207-L236), [appendEvent](../packages/backend/src/core/DatabaseManager.js#L220-L252)
- Upgrade economy to Outbox + deterministic replay as the source of truth  
  Baseline event pipeline: [flushEventBuffer](../packages/backend/src/core/DatabaseManager.js#L145-L190), [appendEvent](../packages/backend/src/core/DatabaseManager.js#L220-L252), [replayToHazelcast](../packages/backend/src/core/DatabaseManager.js#L278-L353)
- Add a channel coordinator for periodic snapshots and dispute/challenge windows  
  Baseline channel model: [ChannelRepository](../packages/backend/src/core/db/repositories/ChannelRepository.js#L21-L219)
- Introduce measurable, auditable scheduling signals (utility/entropy) with evaluation criteria  
  Baseline scheduling inputs: bids/tickets in [TicketManager](../packages/backend/src/core/TicketManager.js#L10-L107)
