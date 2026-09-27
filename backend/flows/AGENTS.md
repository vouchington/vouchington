# Flow packages

- Load [queue authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md) and [the queue checklist](../../docs/checklists/backend-queues.md) before changing flows.
- `backend/flows/core` owns shared `FlowProducer` instances and producer-only cross-queue enqueue APIs. Execution belongs in `backend/workers/*`; never add flow workers/processors.
- Flow packages contain only `queues.mts`, `enqueues.mts`, optional `types.mts`, and `package.json`. Use [core docs](../../docs/overview/architecture/queues/flows/core/README.md), [queues](../queues/AGENTS.md), and [workers](../workers/AGENTS.md) for boundaries.
