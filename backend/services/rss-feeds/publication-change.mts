import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange, type PostPublicationReason } from '@services/post-publication'

export function recordRssFeedDiscoverabilityPublicationChange(
  query: TransactionQuery,
  rssFeedId: string,
  reason: Extract<
    PostPublicationReason,
    'rss_feed_discoverability_changed' | 'rss_feed_enablement_changed'
  > = 'rss_feed_discoverability_changed',
  impactedTopicIds?: readonly string[],
) {
  return recordPostPublicationChange(query, {
    scope: { type: 'rss_feed', rssFeedId },
    reason,
    impactedTopicIds,
  })
}

export function recordRssFeedStatePublicationChange(
  query: TransactionQuery,
  rssFeedId: string,
  kind: 'discoverability' | 'enablement',
) {
  return recordRssFeedDiscoverabilityPublicationChange(
    query,
    rssFeedId,
    kind === 'discoverability' ? 'rss_feed_discoverability_changed' : 'rss_feed_enablement_changed',
  )
}
