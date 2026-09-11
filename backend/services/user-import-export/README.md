# @services/user-import-export

User data import and export — OPML parsing, RSS feed and topic import/export, and auto-follow on approval.

## Key exports

- `userImportExportConfig` — Valkey-backed `DynamicConfig` for import/export runtime knobs.
- `getUserImportExportConfig()` — returns validated config with defaults. `sync_export_max_items`
  defaults to `1,000`, is editable through `/admin/dynamic-config`, and bounds synchronous
  RSS/topic exports.
- `parseOpml(xml)` — parses an OPML document into a list of RSS feed URLs
- `validateRssFeedUrl(url)` — validates a URL before import
- `submitRssFeedImport(currentUser, urls, options?)` — stores a user-owned RSS import batch and rows for async worker processing. Queue jobs carry only import and row IDs.
- `getRssFeedImport(currentUserId, importId)` — returns owner-scoped import progress and per-row outcomes.
- `processRssFeedImportRow(importId, rowId, options?)` — worker entry point for one stored RSS import row.
- `importSingleRssFeed(currentUser, url, options?)` — processes one stored import row; multi-URL imports must use `submitRssFeedImport` and the worker queue.
- `importTopics(currentUserId, slugs)` — imports topics by slug
- `streamUserRssFeeds(currentUserId, maxItems, feedType?)` — cursor-streams at most `maxItems`
  followed RSS feeds in bounded batches.
- `streamUserRssFeedsAsCsv(feeds)` and `streamUserRssFeedsAsOpml(feeds)` — incrementally encode streamed feeds without assembling a complete export.
- `streamUserTopics(currentUserId, maxItems)` — cursor-streams at most `maxItems` followed topics
  in bounded batches.
- `userRssFeedExportExceedsLimit(...)` and `userTopicExportExceedsLimit(...)` — preflight the synchronous item cap before response headers or rows are written.
- `autoFollowOnApproval(currentUserId)` — follows feeds and topics from the user's import queue after account approval

RSS import row success and failure are terminal database states. Retriable errors leave both
terminal timestamps unset; PostgreSQL rejects contradictory outcomes and only permits the batch
completion timestamp when its completed and failed counters reach the declared row total.

Every topic-import `Idempotency-Key` owns the canonical ordered batch and its complete response for
48 hours. The final response, existing-topic follows, and import audits commit in one transaction;
an exact retry therefore returns the original `followed` or `already_following` statuses even after
the user's follow state changes. Reusing a key for another ordered batch returns
`IDEMPOTENCY_KEY_REUSED`. Pending attempts are resumable after a crash, and the data-retention job
deletes both abandoned attempts and completed replays after their indexed expiry.

Missing-topic items keep a separate child admission for each recommendation. Retrying the outer
batch reuses those recommendations before atomically completing the batch response. The database
permits only one audit row per user and recommendation, so a lost response cannot duplicate import
history or later approval work.

Client monitoring does not control server execution. Stopping or restarting a client poller leaves
the queued import running; resuming polls the same owner-scoped import ID. Client surfaces must
ignore responses for another batch and responses whose progress counters regress.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- RSS feeds service: [../rss-feeds/README.md](../rss-feeds/README.md)
- User RSS feed import queue: [../../queues/user-rss-feed-imports/README.md](../../queues/user-rss-feed-imports/README.md)
- Topics service: [../topics/README.md](../topics/README.md)
- User-facing import/export contract: [../../../docs/requirements/content/SOURCES-DOMAINS.md#importexport](../../../docs/requirements/content/SOURCES-DOMAINS.md#importexport)
- HTTP endpoints: [../../api/v1/my/reference-post-api-v1-my-import-rss-feeds.md](../../api/v1/my/reference-post-api-v1-my-import-rss-feeds.md)
