# Related

[Back to Systems Summary](README.md#related)

- [Queue authoring skill](../../.agents/skills/voucha-queue-authoring/SKILL.md) — Triggered workflow for queue, worker, flow, scheduler, and backfill changes
- [Backend queue checklist](../../docs/checklists/backend-queues.md) — Canonical ownership, replayability, and validation contract
- [Agent conventions](CLAUDE.md) — Queue authoring rules for agents
- [Job Replayability & Idempotency](../../docs/requirements/platform/JOB-REPLAYABILITY.md) — Durable replay, delivery-marker, and delayed-job audit requirements
- [Services (Business Logic)](../services/README.md) — Processors call these for all domain logic
- [Worker packages](../workers/CLAUDE.md) — Worker and processor authoring rules
- [Worker entry — CPU](../entrypoints/worker-cpu/README.md) — Rust/sharp/Lightpanda queues
- [Worker entry — IO](../entrypoints/worker-io/README.md) — DB/Valkey/HTTP queues
