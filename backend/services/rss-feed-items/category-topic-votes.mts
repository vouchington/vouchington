import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import {
  publishEntityRelationElectionVoteStats,
  updateEntityRelationElectionVoteStatsFromPrimaryBatch,
} from '@services/elections-votes/entity-relation/vote-stats-batch'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import { getSystemUserByUsername } from '@services/users/system-users'

export type ClearedCategoryTopicMapping = { rss_feed_item_id: string; topic_id: string }

export async function clearCategorizerVotesForUnreferencedCategoryTopicRelations(
  mappings: ClearedCategoryTopicMapping[],
): Promise<void> {
  await using query = await beginTransaction()
  const clearedVotes = await clearCategorizerVotesInTransaction(mappings, query)
  const targets = getClearedCategorizerVoteStatTargets(clearedVotes)
  await updateEntityRelationElectionVoteStatsFromPrimaryBatch(targets, {
    query,
    invalidateCache: false,
    enqueueTopHashtagRefresh: false,
  })
  const statTargets = targets
  await query.commit()
  await publishEntityRelationElectionVoteStats(statTargets, { enqueueTopHashtagRefresh: false })
}

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
  const { rows: candidateRows } = await query<{ id: string }>(
    `/* clearCategoriesForUnlinkedTopicAlias candidateRelations */
      SELECT relation.id
      FROM relation__rss_feed_item__category__topic relation
      JOIN unnest($1::uuid[], $2::uuid[]) AS cleared(rss_feed_item_id, topic_id)
        ON relation.subject_id = cleared.rss_feed_item_id
        AND relation.object_id = cleared.topic_id
      WHERE relation.deleted_at IS NULL
      ORDER BY relation.id
    `,
    [uniqueRelations.map(row => row.rss_feed_item_id), uniqueRelations.map(row => row.topic_id)],
  )
  if (candidateRows.length === 0) return { relation, rows: [] }
  const relationIds = candidateRows.map(row => row.id).toSorted()
  await query(
    `/* clearCategoriesForUnlinkedTopicAlias lock */
      SELECT pg_advisory_xact_lock(
        hashtextextended('entity_relation_votes:' || $1::text || ':' || relation_id::text, 0)
      )
      FROM unnest($2::uuid[]) AS input(relation_id)
      ORDER BY relation_id`,
    [categorizer.id, relationIds],
  )
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
