import type { QueryExecutor } from '@data-stores/psql'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import { getSystemUserByUsername } from '@services/users/system-users'

export type ClearedCategoryTopicMapping = { rss_feed_item_id: string; topic_id: string }

export async function clearCategorizerVotesInTransaction(
  mappings: ClearedCategoryTopicMapping[],
  query: QueryExecutor,
): Promise<{
  relation: EntityRelationMetadata | undefined
  rows: Array<{ id: string }>
}> {
  const topicRelations = new Map<string, ClearedCategoryTopicMapping>()
  for (const mapping of mappings) {
    topicRelations.set(`${mapping.rss_feed_item_id}:${mapping.topic_id}`, mapping)
  }
  const uniqueRelations = [...topicRelations.values()]
  if (uniqueRelations.length === 0) return { relation: undefined, rows: [] }
  const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
  if (!categorizer) return { relation: undefined, rows: [] }
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'rss_feed_item',
    objectType: 'topic',
    predicate: 'category',
  })
  const result = await query<{ id: string }>(
    `/* clearCategoriesForUnlinkedTopicAlias unreferencedRelations */
      SELECT relation.id
      FROM relation__rss_feed_item__category__topic relation
      JOIN unnest($1::uuid[], $2::uuid[]) AS cleared(rss_feed_item_id, topic_id)
        ON relation.subject_id = cleared.rss_feed_item_id
        AND relation.object_id = cleared.topic_id
      WHERE relation.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM rss_feed_item_categories remaining_category
          WHERE remaining_category.rss_feed_item_id = cleared.rss_feed_item_id
            AND remaining_category.topic_id = cleared.topic_id
        )
      ORDER BY relation.id
    `,
    [uniqueRelations.map(row => row.rss_feed_item_id), uniqueRelations.map(row => row.topic_id)],
  )
  await upsertEntityRelationElectionVotes(
    categorizer.id,
    result.rows.map(row => ({ entityId: row.id, score: 0 as const })),
    undefined,
    relation,
    { query, enqueueVoteStats: false },
  )
  return { relation, rows: result.rows }
}

export function getClearedCategorizerVoteStatTargets(clearedVotes: {
  relation: EntityRelationMetadata | undefined
  rows: Array<{ id: string }>
}): Array<ReturnType<typeof createEntityRelationElectionTarget>> {
  const relation = clearedVotes.relation
  if (!relation) return []
  return clearedVotes.rows.map(row =>
    createEntityRelationElectionTarget(row.id, relation.table_name),
  )
}
