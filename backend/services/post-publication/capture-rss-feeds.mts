import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'

const RSS_FEED_PUBLICATION_REASON = 'rss_feed_discoverability_changed' as const

/** Captures many RSS-feed scopes before their discoverability mutation commits. */
export async function recordRssFeedDiscoverabilityChanges(
  query: TransactionQuery,
  rssFeedIds: readonly string[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  const ids = normalizePostPublicationIdentifiers(rssFeedIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    for (const rssFeedId of batch)
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'rss_feed', rssFeedId },
        reason: RSS_FEED_PUBLICATION_REASON,
        keys: [{ kind: 'identity_rss_feed', uuidValue: rssFeedId }],
      })
  }
}
