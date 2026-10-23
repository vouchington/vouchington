import type { TransactionQuery } from '@data-stores/psql'
import { recordStoryPublicationChangesForCategoryTopics } from './story-publication-change.mts'
import { recordTopicAliasPublicationWork } from '@services/post-publication'
import type { CategoryTopicMutation } from './categories-chunks.mts'

export async function recordCategoryPublicationChanges(
  query: TransactionQuery,
  changes: readonly CategoryTopicMutation[],
  repairedTopicAliasIds: readonly string[],
): Promise<void> {
  await recordStoryPublicationChangesForCategoryTopics(query, changes)
  await recordTopicAliasPublicationWork(query, [
    ...repairedTopicAliasIds,
    ...changes.flatMap(change =>
      change.previous_topic_alias_id !== change.topic_alias_id
        ? [change.previous_topic_alias_id, change.topic_alias_id].filter(
            (id): id is string => id !== null,
          )
        : [],
    ),
  ])
}
