import type { QueryExecutor } from '@data-stores/psql'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import { getSystemUserByUsername } from '@services/users/system-users'

export type StaleCategory = {
  rss_feed_item_id: string
  topic_id: string | null
  topic_alias_id: string | null
}

type CategoryRelationKind = 'topic' | 'topic_alias'
type CategoryRelationMapping = {
  rss_feed_item_id: string
  object_id: string
  kind: CategoryRelationKind
}

const relationMetadata = {
  topic: getEntityRelationMetadataOrThrow({
    subjectType: 'rss_feed_item',
    objectType: 'topic',
    predicate: 'category',
  }),
  topic_alias: getEntityRelationMetadataOrThrow({
    subjectType: 'rss_feed_item',
    objectType: 'topic_alias',
    predicate: 'category',
  }),
} as const satisfies Record<CategoryRelationKind, EntityRelationMetadata>

export async function retractUnsupportedCategorizerVotes(
  staleCategories: readonly StaleCategory[],
  query: QueryExecutor,
): Promise<void> {
  const mappings = staleCategories.flatMap(category => [
    ...(category.topic_id
      ? [
          {
            rss_feed_item_id: category.rss_feed_item_id,
            object_id: category.topic_id,
            kind: 'topic' as const,
          },
        ]
      : []),
    ...(category.topic_alias_id
      ? [
          {
            rss_feed_item_id: category.rss_feed_item_id,
            object_id: category.topic_alias_id,
            kind: 'topic_alias' as const,
          },
        ]
      : []),
  ])
  if (mappings.length === 0) return
  const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
  if (!categorizer) throw new Error(`Missing system user: ${RSS_FEED_CATEGORIZER_USERNAME}`)
  await Promise.all(
    (['topic', 'topic_alias'] as const).map(kind =>
      retractUnsupportedCategorizerVotesForKind(
        categorizer.id,
        dedupeMappings(mappings.filter(mapping => mapping.kind === kind)),
        relationMetadata[kind],
        query,
      ),
    ),
  )
}

async function retractUnsupportedCategorizerVotesForKind(
  categorizerId: string,
  mappings: CategoryRelationMapping[],
  metadata: EntityRelationMetadata,
  query: QueryExecutor,
): Promise<void> {
  if (mappings.length === 0) return
  const relationIds = await getCategoryRelationIds(mappings, metadata, query)
  if (relationIds.length === 0) return
  await query(
    `/* reconcileRssFeedItemCategorySnapshots lock */
    SELECT pg_advisory_xact_lock(hashtextextended('entity_relation_votes:' || $1::text || ':' || relation_id::text, 0))
    FROM unnest($2::uuid[]) AS input(relation_id) ORDER BY relation_id`,
    [categorizerId, relationIds.map(relation => relation.id).toSorted()],
  )
  const categoryColumn = metadata.object_type === 'topic' ? 'topic_id' : 'topic_alias_id'
  const { rows } = await query<{ id: string }>(
    `/* reconcileRssFeedItemCategorySnapshots unsupportedRelations */
      SELECT relation.id FROM ${metadata.table_name} relation
      JOIN unnest($1::uuid[], $2::uuid[]) AS mapping(rss_feed_item_id, object_id)
        ON relation.subject_id = mapping.rss_feed_item_id AND relation.object_id = mapping.object_id
      WHERE relation.deleted_at IS NULL AND NOT EXISTS (
        SELECT 1 FROM rss_feed_item_categories category
        WHERE category.rss_feed_item_id = mapping.rss_feed_item_id AND category.${categoryColumn} = mapping.object_id)
      ORDER BY relation.id`,
    [mappings.map(mapping => mapping.rss_feed_item_id), mappings.map(mapping => mapping.object_id)],
  )
  await upsertEntityRelationElectionVotes(
    categorizerId,
    rows.map(row => ({ entityId: row.id, score: 0 as const })),
    undefined,
    metadata,
    { query, enqueueVoteStats: false },
  )
}

function dedupeMappings(mappings: CategoryRelationMapping[]): CategoryRelationMapping[] {
  return [
    ...new Map(
      mappings.map(mapping => [`${mapping.rss_feed_item_id}:${mapping.object_id}`, mapping]),
    ).values(),
  ]
}

async function getCategoryRelationIds(
  mappings: CategoryRelationMapping[],
  metadata: EntityRelationMetadata,
  query: QueryExecutor,
): Promise<Array<{ id: string }>> {
  return (
    await query<{ id: string }>(
      `/* reconcileRssFeedItemCategorySnapshots relationIds */
      SELECT relation.id FROM ${metadata.table_name} relation
      JOIN unnest($1::uuid[], $2::uuid[]) AS mapping(rss_feed_item_id, object_id)
        ON relation.subject_id = mapping.rss_feed_item_id AND relation.object_id = mapping.object_id
      WHERE relation.deleted_at IS NULL ORDER BY relation.id`,
      [
        mappings.map(mapping => mapping.rss_feed_item_id),
        mappings.map(mapping => mapping.object_id),
      ],
    )
  ).rows
}
