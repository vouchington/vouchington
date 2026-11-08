import type { TransactionQuery } from '@data-stores/psql'
import { impactPublicationKeys } from '@services/post-publication/captured-keys'
import { enqueueCapturedPublicationChangeAfterCommit } from '@services/post-publication/direct-capture'

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
  for (const [topicAliasId, itemIds] of itemIdsByAlias)
    enqueueCapturedPublicationChangeAfterCommit(query, {
      scope: { type: 'topic_alias', topicAliasId },
      reason: 'post_topics_changed',
      keys: impactPublicationKeys({ rssFeedItemIds: [...itemIds] }),
    })
}
