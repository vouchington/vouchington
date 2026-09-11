# Checklists

Consolidated lifecycle and edit checklists for the Voucha monorepo. Each checklist is the authoritative reference for its action; matching skills provide minimal entry points that route back here instead of duplicating the rules. Dedicated Codex adapters are intentionally limited to the three lifecycle checklist skills.

## Checklists

- [Commit Checklist](commit.md) — Format, lint, commit-message, and file-size rules before committing
- [package.json Checklist](package-json.md) — Version policy, pnpm, lockfile, and new-service registration
- [Parser and Library Swap Checklist](parser-library-swap.md) — Characterization tests and migration order for parser/tokenizer/library replacements
- [GitHub Actions Checklist](github-actions.md) — Runner choice, pinning, concurrency, and docs-sync rules
- [Backend Queue Authoring Checklist](backend-queues.md) — Queue/worker ownership, replayability, scheduling, backfills, and validation
- [Native Parity Interactions](native-parity-interactions.md) — Native list/detail interaction checks, pagination cursors, and visibility gates
- [Stripe Webhook Events](stripe-webhook-events.md) — Canonical list of Stripe events to subscribe to per environment
- [Finite Enum Ripple Checklist](../development/finite-enum-ripple-checklist.md) — Scan surfaces for closed-string-set renames/removals

## See Also

- Skills: [.agents/skills/git-commit-checklist](../../.agents/skills/git-commit-checklist/SKILL.md), [package-json-checklist](../../.agents/skills/package-json-checklist/SKILL.md), [github-actions-checklist](../../.agents/skills/github-actions-checklist/SKILL.md), [voucha-queue-authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md)
- Lifecycle Codex checklist adapters: [.codex/agents/git-commit-checklist.toml](../../.codex/agents/git-commit-checklist.toml), [package-json-checklist.toml](../../.codex/agents/package-json-checklist.toml), [github-actions-checklist.toml](../../.codex/agents/github-actions-checklist.toml)
- [docs/README.md](../README.md) — Full documentation index
