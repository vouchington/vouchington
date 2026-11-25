import { v5 as uuidv5 } from 'uuid'
import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange, type PostPublicationReason } from '@services/post-publication'
import { enqueueCapturedPublicationChangeAfterCommit } from '@services/post-publication/direct-capture'
import type { RssFeedStateInsert } from './state-changes.mts'

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

/** Appends based on the same decision share a publication job identity. */
export function recordRssFeedStatePublicationChange(
  query: TransactionQuery,
  rssFeedId: string,
  change: Pick<RssFeedStateInsert, 'kind' | 'is_enabled'>,
  priorDecisionId: string | undefined,
): void {
  const feedId = rssFeedId.toLowerCase()
  const reason =
    change.kind === 'discoverability'
      ? 'rss_feed_discoverability_changed'
      : 'rss_feed_enablement_changed'
  enqueueCapturedPublicationChangeAfterCommit(query, {
    scope: { type: 'rss_feed', rssFeedId: feedId },
    reason,
    keys: [{ kind: 'identity_rss_feed', uuidValue: feedId }],
    changeId: uuidv5(JSON.stringify([reason, priorDecisionId ?? null, change.is_enabled]), feedId),
  })
}
