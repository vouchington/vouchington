# @services/analytics

Typed emit wrappers for the analytics data store.

## Overview

Each module in this package provides domain-specific helper functions that call
`emit()` from `@data-stores/analytics`. They exist so call sites never
construct raw analytics records by hand and the schema stays consistent.

## Modules

| Module              | Functions                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crawler.mts`       | `trackCrawlerRequest`, `trackDomainRateLimitLocked`, `trackDomainRateLimitDeferred`                                                              |
| `cache.mts`         | `trackCacheCall`                                                                                                                                 |
| `queue.mts`         | `trackJobEnqueue`, `trackQueueWorkerEvent`, `trackQueueWorkerJobProgressEvent`, `trackQueueWorkerJobCompletedEvent`                              |
| `ai.mts`            | `trackAIEmbeddingCall`, `trackAIModerationCall`                                                                                                  |
| `web-page-view.mts` | `recordLandingPageVisit`, `recordRecentlyViewedTopic`, `recordRecentlyViewedPost`, `recordRecentlyViewedRssFeedItem`, `recordRecentlyViewedUser` |
| `web-click.mts`     | `recordLandingPageItemClick`                                                                                                                     |
| `auth-session.mts`  | `trackAuthSessionEvent`                                                                                                                          |

## Usage

```typescript
import { trackCrawlerRequest } from '@services/analytics'

trackCrawlerRequest('html', 'example.com', 200, 120, true)
```

```typescript
import { trackAuthSessionEvent } from '@services/analytics'

trackAuthSessionEvent({ did, sid, uid, eventType: 'created' })
```

`eventType` is one of `created`, `refreshed_authenticated`, or `refreshed_anonymous`.

## Related

- Agent conventions: [CLAUDE.md](CLAUDE.md)
- Data store: [../../data-stores/analytics/CLAUDE.md](../../data-stores/analytics/CLAUDE.md)
- Analytics pipeline: [../../../docs/overview/architecture/analytics-pipeline.md](../../../docs/overview/architecture/analytics-pipeline.md)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
