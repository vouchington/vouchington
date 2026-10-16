# Queue Monitoring Service

Source entrypoint: [backend/services/queue-monitoring/README.md](../../../../../backend/services/queue-monitoring/README.md)

Real-time monitoring of glide-mq job queues.

```mermaid
flowchart TD
  API[MQ API route] --> Auth[currentUserCanAccessQueueStats]
  Auth --> Stats["getAllQueueStats / getAggregatedQueueStats"]
  Stats --> Glide[(GlideMQ queues)]
```

## Modules

- **authorization.mts** — `currentUserCanAccessQueueStats()` admin role check
- **domains.mts** and **domain-stats.mts** — per-domain stats, pause, resume, and failed-job retry for a shared queue (the [background queue](../../queues/background/README.md)). `listManagedQueueDomains(queueName)` returns each domain's pause state and `{ count, complete }` per state from a capped scan of the domain's own job names, read fresh on every call; `setManagedQueueDomainPaused` and `retryManagedQueueDomainFailedJobs` record one staff operation per change. The whole-queue controls in `controls.mts` reject a queue that has domains.
- Queue statistics, bounded waiting-age reads, and cache/Lua implementation live in [the GlideMQ data store](../../backend/data-stores/valkey-glide-mq/README.md).
- **publish-cloudwatch.mts** — bounded class-level depth/staleness publisher

## Functions

- `getQueueStats(name)` — get stats for a single queue (waiting, active, delayed, completed, failed, paused)
- `getAllQueueStats(queueNames)` — batch fetch and sort stats for multiple queues
- `getAggregatedQueueStats(queueNames)` — aggregate totals across all queues, including `totalDelayed`
- `getAggregatedQueueMetricStats(queueNames)` — metrics-only aggregate with bounded oldest-waiting-job age; its `totalWaiting` already counts due priority jobs, so it has no `totalDelayed`

## Data Model

No owned database tables. Reads live queue state directly from GlideMQ (Valkey-backed):

- Queue stats (waiting, active, delayed, completed, failed counts) are fetched via the GlideMQ client API.
  `delayed` is the scheduled set: unpromoted priority jobs, future delays and backoff retries.
- `oldestWaitingAgeMs` reads one oldest waiting job without loading the backlog.
- Paused state is tracked per-queue in the queue's Valkey key space. A domain's pause state lives in `queue_domain_controls`, owned by [`@services/queue-domain-controls`](../queue-domain-controls/README.md).
- Per-domain counts are partial by design, capped by the `domain_stats_scan_cap` field with `complete: false` when a scan stopped at the cap. Waiting, active, and delayed bucket one capped `getJobs` read per state by job name (GlideMQ's name search is unbounded for waiting and misses active priority jobs); failed and completed search the domain's names.

The worker-cpu registers one five-minute publisher through the universal `heartbeat` queue. It
writes only `GlideMQWaiting` and `GlideMQOldestWaitingAge`, each with one `QueueClass` dimension
(`cpu` or `io`), to `Voucha/staging` or `Voucha/production`. SQS ingress queues stay on native
`AWS/SQS` metrics and are excluded from this publisher. Local and test environments are no-ops.

## Usage Examples

```typescript
import {
  getQueueStats,
  getAllQueueStats,
  getAggregatedQueueStats,
} from '@data-stores/valkey-glide-mq/get-queue-stats'

// Single queue
const stats = await getQueueStats('email-queue')
// => { name: 'email-queue', waiting: 5, active: 2, delayed: 4, completed: 1000, failed: 3, paused: false }

// All queues (sorted by name)
const allStats = await getAllQueueStats(['email-queue', 'moderation-queue'])

// Aggregate totals
const totals = await getAggregatedQueueStats(['email-queue', 'moderation-queue'])
// => { totalWaiting: 10, totalActive: 4, totalDelayed: 7, totalCompleted: 2000, totalFailed: 6, queueCount: 2 }
```

## Related

- [Queue Monitoring API](../../../../requirements/api/v1/mq/README.md)
- [Services AGENTS.md](../../../../../backend/services/AGENTS.md)
- [Infrastructure Overview](../../../infrastructure/infrastructure.md)

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

- `removeQueueScheduler`
