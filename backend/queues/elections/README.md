# Elections System

Queue system for asynchronous vote-stat refreshes.

## Queue

| Queue       | Processor                        | Group Keys        | Default Priority |
| ----------- | -------------------------------- | ----------------- | ---------------- |
| `elections` | `processUpdateElectionVoteStats` | `post`            | 10               |
| `elections` | `processUpdateElectionVoteStats` | `entity_relation` | 10               |
| `elections` | `processUpdateElectionVoteStats` | `rss_feed_item`   | 10               |

## Responsibilities

- refresh election vote stats after write paths enqueue follow-up work
- keep expensive stats recalculation off synchronous request paths
- coalesce each election ID into a fixed five-second throttle window, then wait one additional
  second for replica propagation before recomputing
- carry both the entity-relation ID and its metadata-validated relation table for entity-relation
  jobs, allowing PostgreSQL to prune the relation table and UUIDv7 range partitions

```mermaid
sequenceDiagram
  participant V as Vote writes
  participant Q as Elections queue
  participant R as Read replica
  V->>Q: t=0 enqueue accepted
  V-->>Q: 0 ≤ t < 5 same-election enqueues throttled
  Note over Q: t=5 throttle expires
  Q->>R: t=6 recompute after 1s lag margin
```

## Related

- Vote services: [../../services/elections-votes/README.md](../../services/elections-votes/README.md)
- PostgreSQL aggregation rule:
  [../../../docs/development/postgres-schema-rules.md#large-aggregation-recomputes-read-the-replica-and-absorb-lag-asynchronously](../../../docs/development/postgres-schema-rules.md#large-aggregation-recomputes-read-the-replica-and-absorb-lag-asynchronously)
- Systems overview: [../README.md](../README.md)
