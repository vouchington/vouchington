# Flow Packages

`backend/flows/core` owns shared `FlowProducer` instances and producer-only flow enqueue APIs that
coordinate jobs across queue packages. Do not add workers or processors under `backend/flows/*`;
execution belongs in `backend/workers/*`.

Load [voucha-queue-authoring](../../.agents/skills/voucha-queue-authoring/SKILL.md) and follow the
[backend queue checklist](../../docs/checklists/backend-queues.md) before changing a flow. Flow
packages contain only `queues.mts`, `enqueues.mts`, optional `types.mts`, and `package.json`.

## See Also

- Shared flow package: [core/README.md](core/README.md)
- [Queue packages](../queues/CLAUDE.md)
- [Worker packages](../workers/CLAUDE.md)
- [Backend context](../CLAUDE.md)
