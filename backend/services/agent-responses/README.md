# Agent Responses Service

Manages agent response lifecycle: creation, retrieval, updates, authorization, and quota enforcement for server-side agent runs.

## Data Model

- `agent_responses` — the sole durable PostgreSQL row per run: agent type, input/output/error JSONB,
  job ID, termination reason, and timestamps

`agent_responses` uses monthly `RANGE` partitions on `id`. `cleanupPartitions` drops whole expired
partitions, so its configured 30-day retention produces an approximate 30–61-day effective window,
not an exact per-row cutoff. See the canonical [PostgreSQL Partitioning
Strategy](../../../docs/overview/architecture/partitioning-strategy.md).
Completion and failure are mutually exclusive terminal states. Conditional updates keep the first terminal
transition and ignore late worker callbacks, while a table constraint prevents invalid terminal rows.

## Event Stream

Agent-response SSE uses `publishAgentResponseEvent` and `subscribeAgentResponseEvents` from the
Valkey data store. These live events are transient pub/sub notifications, not a PostgreSQL event log.
POST subscribes before enqueue to avoid missing early live events. Reconnect GET first reads
PostgreSQL for existence and authorization, then subscribes before reading its durable snapshot for
stream recovery. Routes close each subscription in `finally` and recover from the durable PostgreSQL
`agent_responses` snapshot rather than relying on pub/sub delivery history. See the Valkey [pub/sub
lifecycle](../../data-stores/valkey/README.md#pubsub-lifecycle) guidance for cleanup and
fire-and-forget error handling rules.

## Modules

| File                | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `create.mts`        | Insert a new agent response row                            |
| `get.mts`           | Fetch by ID, count running by user                         |
| `update.mts`        | Mark started, completed, failed                            |
| `authorization.mts` | `currentUserCanViewAgentResponse` — owner-only check       |
| `quota-config.mts`  | DynamicConfig integration for daily limits and timeouts    |
| `quota.mts`         | Valkey RateLimiter-backed quota and concurrency guards     |
| `events.mts`        | Re-exports `publishAgentResponseEvent` from the data store |
| `types.mts`         | Shared TypeScript types                                    |

## Related

- Worker: [ai-agents worker](../../workers/ai-agents/)
- API: [agent-responses API](../../api/v1/agent-responses/)
- Quota precedent: [contribution-gating service](../contribution-gating/)
