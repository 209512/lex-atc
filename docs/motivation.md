# Motivation

lex-atc started from a practical question:
when multiple organizations run their own AI agents and those agents must collaborate on a shared resource (a document, a ledger, a workflow),
**who gets priority** — and **who decides the rule**?

In a single-team system, an operator can arbitrate conflicts. In cross-organization collaboration, that answer is often unsatisfying:

- operator discretion is hard to justify externally,
- criteria drift over time,
- disputes are inevitable without an audit trail.

This project explores an agent orchestration runtime where contention and intervention become:

- **explicit policies** ([governance](./glossary.md#governance)),
- **auditable events** (history),
- and optionally **economically enforceable outcomes** ([settlement](./glossary.md#settlement)).

The goal is not “blockchain for everything”, but to test whether on-chain notarization/settlement can be a pragmatic tool for:

- verifiable fairness,
- traceable accountability,
- and cross-boundary coordination.
