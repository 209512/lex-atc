# Glossary

## ATC

Agent Traffic Control. Agents contending for shared resources under explicit control and policies.

## Lock

Exclusive access primitive used to coordinate competing agents (e.g., Hazelcast FencedLock).

## Fence Token

A monotonically increasing token proving lock ownership freshness; prevents stale holders from writing.

## Governance

Operator/system policy workflow for interventions (priority, halt, override).

## Settlement

Finalization/attestation layer for outcomes that should be verifiable and accountable.

## Dispute

A challenge process for suspicious or invalid state transitions, optionally leading to slashing.

## Nonce

Monotonic sequence number used for ordering and idempotency of channel snapshots and disputes.

## SSE

Server-Sent Events; streaming channel used by the UI to observe runtime state.

## Standalone (MSW Simulation)

Frontend-only simulation mode using Mock Service Worker.

## Backend Mode

Mode where frontend calls a real backend API and receives real SSE streams.
