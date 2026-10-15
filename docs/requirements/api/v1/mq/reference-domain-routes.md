# MQ Domain Routes

[Back to the MQ API](README.md)

The shared `background` queue runs many domains (see the
[background queue](../../../../overview/architecture/queues/background/README.md)), so it is
controlled per domain and its whole-queue `pause` and `retry-failed` answer 400. Every other queue
answers 404 on the domain routes. An unknown `:domain` is 404. These routes are additive: the queue
list, stats, and stream shapes of the [MQ API](README.md) are unchanged, and `background` appears in them as one queue
with exact totals.

## GET /api/v1/mq/queues/:name/domains

Response: `{ domains: Array<{ domain, paused, paused_at, paused_by, reason, waiting, active, delayed, completed, failed }> }`
where each state is `{ count: number, complete: boolean }`.

Counts come from a capped, per-request scan of the domain's own job names (the
`domain_stats_scan_cap` field of the `background-queue-config` DynamicConfig namespace) and are
read fresh each time. `complete: false` means the scan stopped at the cap, so `count` is a lower
bound and clients show `count+`. A state under the cap is exact. Domains with no control row report
`paused: false` and null `paused_at`, `paused_by`, and `reason`.

## POST /api/v1/mq/queues/:name/domains/:domain/pause

Optional JSON body `{ reason?: string | null }` (at most 500 characters after trimming; longer is
422). Pausing records one `queue_pause` staff operation with `queue_name` and `metadata.domain`;
repeating the current state is a no-op with no second record. Response: `{ success: true }`. Paused
jobs wait without spending an attempt and resume on their own.

## POST /api/v1/mq/queues/:name/domains/:domain/resume

Same audit and no-op rules with `queue_resume`. Response: `{ success: true }`.

## POST /api/v1/mq/queues/:name/domains/:domain/retry-failed

Retries at most the first 100 failed jobs whose names belong to the domain, as `queue_retry_failed`.
Response: `{ success: true, retried: number }`.
