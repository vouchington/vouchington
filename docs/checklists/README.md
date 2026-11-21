# Checklists

Consolidated lifecycle and edit checklists for the Voucha monorepo. Each checklist is the authoritative reference for its action; matching skills provide minimal entry points that route back here instead of duplicating the rules. Skills get no dedicated Codex agent adapters.

## Checklists

- [package.json Checklist](package-json.md) — Version policy, pnpm, lockfile, and new-service registration
- [Parser and Library Swap Checklist](parser-library-swap.md) — Characterization tests and migration order for parser/tokenizer/library replacements
- [GitHub Actions Checklist](github-actions.md) — Enforced-check owners, runner demand, deploy decoupling, and verification
- [Backend Queue Authoring Checklist](backend-queues.md) — Queue/worker ownership, replayability, scheduling, backfills, and validation
- [Native Parity Interactions](native-parity-interactions.md) — Native list/detail interaction checks, pagination cursors, and visibility gates
- [Stripe Events](stripe-events.md) — Canonical list of Stripe events to subscribe to per environment
- [Finite Enum Ripple Checklist](../development/finite-enum-ripple-checklist.md) — Scan surfaces for closed-string-set renames/removals

## See Also

- Skills: [voucha-queue-authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md)
- [docs/README.md](../README.md) — Full documentation index

## Reference index

- [Define a replay-safe job](reference-backend-queues-define-a-replay-safe-job.md)
- [Durable transition matrix](reference-backend-queues-durable-transition-matrix.md)
- [Schedulers, flows, and backfills](reference-backend-queues-schedulers-flows-and-backfills.md)
