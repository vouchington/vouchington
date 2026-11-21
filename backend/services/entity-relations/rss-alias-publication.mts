import type { TransactionQuery } from '@data-stores/psql'
import { impactPublicationKeys } from '@services/post-publication/captured-keys'
import { enqueueBulkCapturedPublicationChangesAfterCommit } from '@services/post-publication/direct-capture'

/** Retain the written item identities even if their alias relation is later cascade-deleted. */
export function recordRssAliasRelationPublicationChanges(
  query: TransactionQuery,
  changes: readonly { subject_id: string; object_id: string }[],
): void {
  const itemIdsByAlias = new Map<string, Set<string>>()
  for (const { subject_id: itemId, object_id: aliasId } of changes) {
    const itemIds = itemIdsByAlias.get(aliasId) ?? new Set<string>()
    itemIds.add(itemId)
    itemIdsByAlias.set(aliasId, itemIds)
  }
  enqueueBulkCapturedPublicationChangesAfterCommit(
    query,
    [...itemIdsByAlias].map(([topicAliasId, itemIds]) => ({
      scope: { type: 'topic_alias' as const, topicAliasId },
      reason: 'post_topics_changed' as const,
      keys: impactPublicationKeys({ rssFeedItemIds: [...itemIds] }),
    })),
  )
}
