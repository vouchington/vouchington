import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'

type TopicAliasOwnershipChange = {
  aliasId: string
  alias: string
  previousTopicId: string | null
  nextTopicId: string | null
}

export async function recordTopicAliasPublicationChanges(
  query: TransactionQuery,
  changes: readonly TopicAliasOwnershipChange[],
): Promise<void> {
  const changesByAliasId = new Map<string, { alias: string; topicIds: Set<string> }>()
  for (const change of changes) {
    if (change.previousTopicId === change.nextTopicId) continue
    const retained = changesByAliasId.get(change.aliasId) ?? {
      alias: change.alias,
      topicIds: new Set<string>(),
    }
    if (retained.alias !== change.alias)
      throw new TypeError('Topic alias publication changes require one stable alias identity')
    const { topicIds } = retained
    if (change.previousTopicId) topicIds.add(change.previousTopicId)
    if (change.nextTopicId) topicIds.add(change.nextTopicId)
    changesByAliasId.set(change.aliasId, retained)
  }

  const aliasIds = [...changesByAliasId.keys()].toSorted()
  if (aliasIds.length === 0) return
  for (const aliasId of aliasIds) {
    const retained = changesByAliasId.get(aliasId)!
    // oxlint-disable-next-line no-await-in-loop -- one captured alias scope per mutation.
    await recordPostPublicationChange(query, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
      impactedTopicIds: [...retained.topicIds].toSorted(),
      topicAliasText: retained.alias,
    })
  }
}
