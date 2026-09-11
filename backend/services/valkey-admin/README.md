# Valkey Admin Service

Administrative operations for Valkey: bloom filter configuration, entity cache management, and
scoped per-concern key flushing.

## Modules

- **authorization.mts** — `currentUserCanAccessValkeyAdmin()` admin role check
- **clear-cache.mts** — Cache group definitions and clearing operations
- **flush-targets.mts** — Structurally exhaustive prefix ownership shared by diagnosis and mutation
- **diagnostics.mts** — Curated `INFO memory` parsing, single-topology validation, and one read-only
  cursor scan that classifies observed keys without retaining or emitting key names
- **flush.mts** — `flushConcern()` for the six concerns handled at the
  service layer (`caches`, `recently-viewed`, `blooms`, `rate-limiter`, `dynamic-config`,
  `sessions`); the seventh concern, `queues`, is handled in
  [`backend/api/v1/valkey/queues-flush.mts`](../../api/v1/valkey/queues-flush.mts) instead — see
  Flush Concerns below

## Flush Concerns

The Valkey keyspace is flat (single db, no client-level `keyPrefix`), so a scoped flush is always a
prefix-based SCAN+UNLINK, never `FLUSHDB`. Each concern maps to one or more prefixes:

| Concern           | Prefix(es)                                                                                                                                                                                                                  | Mechanism                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `caches`          | The cache groups below                                                                                                                                                                                                      | `clearAllCaches()` (no key count reported)                       |
| `recently-viewed` | `recently-viewed:*`                                                                                                                                                                                                         | SCAN+UNLINK                                                      |
| `blooms`          | `bloom-filter:*`, `bookmark-bloom-ready:*`                                                                                                                                                                                  | SCAN+UNLINK                                                      |
| `rate-limiter`    | `rate-limiter:*`                                                                                                                                                                                                            | `RateLimiter.invalidate()` (no key count reported)               |
| `dynamic-config`  | `dynamic-config:*`                                                                                                                                                                                                          | SCAN+UNLINK                                                      |
| `sessions`        | `voucha:jwt-stale:*`, `voucha:jwt-revoked:*`, `voucha:jwt-user-revoked-before:*`, `passkey-challenge:*`, `mfa-login-attempt:*`, `mfa-reauth:*`, `bluesky-oauth-state:*`, `app-attest-challenge:*`, `app-attest-req-nonce:*` | SCAN+UNLINK — requires `force: true`                             |
| `queues`          | Every registered queue + retained legacy DLQ name under `<worker-namespace>:{<queue>}:*`, plus `<worker-namespace>:usage:*`; the namespace is `glide` or the configured `voucha_qdb_N` prefix                               | `Queue.obliterate()` + SCAN+UNLINK (no key count for obliterate) |

`sessions` is the only concern that requires an explicit `force: true` — flushing it forcibly logs
out every user and invalidates in-flight passkey/MFA/OAuth challenges.

The one-off ECS command propagates its shutdown `AbortSignal` through diagnostic and destructive
cursor loops. Cancellation never interrupts queue-handle cleanup that has already started, but it
stops starting new prefix scans, page unlinks, or queue obliterations. Cache-wide and rate-limiter
invalidation are single library calls, so they are checked immediately before and after dispatch;
an in-flight call settles, then cancellation suppresses successful result evidence because exact
completion became uncertain.

## Cache Groups

Entity caches are organized into groups for targeted clearing:

| Group       | Prefixes                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| `users`     | users_private, users_public, users_lookup, user_metrics                     |
| `topics`    | topics, topics_with_redirect, topics_lookup, topic_metrics, topic_elections |
| `posts`     | posts, posts_lookup, post_metrics, post_elections                           |
| `rss`       | rss_feeds, rss_feed_items, rss_feed_item_elections                          |
| `urls`      | urls, urls_lookup, url_hostnames, hostname_elections                        |
| `elections` | entity_relation_elections, agent_moderation_elections                       |

Cache clearing passes every selected raw cache prefix to `ValkeyCache.invalidateMany()` in one
call. Valkyries performs one cursor scan shared by all prefixes and unlinks matching keys in
bounded pages, avoiding a separate full scan for every prefix. Other prefix-based concerns use
Valkyries' `scanAndUnlinkKeys()` directly and retain only their application-specific prefix lists.

## Diagnostic Semantics

Diagnosis requires every configured Valkey concern to resolve to the same protocol, host, port,
and effective database. Ordinary concern URL paths select a Valkey database. GlideMQ instead
connects to database 0 and maps `VALKEY_WORKER_QUEUE_URL` path `/N` to the `voucha_qdb_N` key
prefix; diagnostics validate that effective topology and classify the prefixed queue keys in the
shared database-0 scan. The command returns a curated memory summary and observed counts for all
seven concerns plus `unclassified`. Counts come from one non-atomic `SCAN *`: concurrent writes can
change the keyspace or cause duplicate observations, so the values are operational signals, not
an exact snapshot or per-concern memory attribution. Diagnosis is read-only and never emits key
names, connection URLs, credentials, or raw `INFO` output.

## Related

- API: [../../api/v1/valkey/README.md](../../api/v1/valkey/README.md)
- Entity cache: [../entity-cache/](../entity-cache/README.md)
- Operations: [../../../docs/operations/valkey-memory-recovery.md](../../../docs/operations/valkey-memory-recovery.md)
