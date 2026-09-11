import { read, type QueryExecutor } from '@data-stores/psql'
import onError from '@modules/on-error'
import { getSystemUserByUsername } from '@services/users/system-users'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import type { BasicUser } from '@services/users/types'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'

// Lazy-cached mapper context; resolved once per process lifetime.
let mapperContext: {
  mapper: BasicUser
  topicRelation: EntityRelationMetadata
  hashtagRelation: EntityRelationMetadata
} | null = null

async function getMapperContext(): Promise<{
  mapper: BasicUser
  topicRelation: EntityRelationMetadata
  hashtagRelation: EntityRelationMetadata
} | null> {
  if (mapperContext) return mapperContext
  const mapper = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
  if (!mapper) return null
  const topicRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'rss_feed_item',
    objectType: 'topic',
    predicate: 'category',
  })
  const hashtagRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'rss_feed_item',
    objectType: 'topic_alias',
    predicate: 'category',
  })
  mapperContext = { mapper, topicRelation, hashtagRelation }
  return mapperContext
}

/**
 * Create or upvote category entity relations for the given (rss_feed_item_id, topic_id) pairs,
 * using the low-weight rss-feed-categorizer system user as the voter.
 */
export async function createCategoryRelations(
  pairs: ReadonlyArray<{ rss_feed_item_id: string; topic_id: string }>,
  hashtagPairs: ReadonlyArray<{ rss_feed_item_id: string; topic_alias_id: string }> = [],
  options: { enqueueTopHashtagRefresh?: boolean } = {},
): Promise<void> {
  if (pairs.length === 0 && hashtagPairs.length === 0) return
  const ctx = await getMapperContext()
  /* v8 ignore start -- only reachable if rss-feed-categorizer user absent; db:migrate always seeds it */
  if (!ctx) {
    onError(
      new Error(
        `System user '${RSS_FEED_CATEGORIZER_USERNAME}' not found — cannot create category relations`,
      ),
    )
    return
  }
  /* v8 ignore stop */
  const { mapper, topicRelation, hashtagRelation } = ctx

  const uniquePairs = new Map<string, { subject: { id: string }; object: { id: string } }>()
  for (const { rss_feed_item_id, topic_id } of pairs) {
    uniquePairs.set(`${rss_feed_item_id}:${topic_id}`, {
      subject: { id: rss_feed_item_id },
      object: { id: topic_id },
    })
  }

  const uniqueHashtagPairs = new Map<string, { subject: { id: string }; object: { id: string } }>()
  for (const { rss_feed_item_id, topic_alias_id } of hashtagPairs) {
    uniqueHashtagPairs.set(`${rss_feed_item_id}:${topic_alias_id}`, {
      subject: { id: rss_feed_item_id },
      object: { id: topic_alias_id },
    })
  }
  const [topicRelations, hashtagRelations] = await Promise.all([
    uniquePairs.size > 0
      ? writeEntityRelations(topicRelation, mapper, [...uniquePairs.values()], {
          vote: true,
          enqueueVoteStats: false,
        })
      : Promise.resolve([]),
    uniqueHashtagPairs.size > 0
      ? writeEntityRelations(hashtagRelation, mapper, [...uniqueHashtagPairs.values()], {
          vote: true,
          enqueueVoteStats: false,
        })
      : Promise.resolve([]),
  ])
  await updateEntityRelationElectionVoteStatsFromPrimaryBatch(
    [
      ...topicRelations.flatMap(relation =>
        relation.id
          ? [createEntityRelationElectionTarget(relation.id, topicRelation.table_name)]
          : [],
      ),
      ...hashtagRelations.flatMap(relation =>
        relation.id
          ? [createEntityRelationElectionTarget(relation.id, hashtagRelation.table_name)]
          : [],
      ),
    ],
    options,
  )
}

export async function createCategoryTopicRelationsInTransaction(
  pairs: ReadonlyArray<{ rss_feed_item_id: string; topic_id: string }>,
  query: QueryExecutor,
): Promise<Array<ReturnType<typeof createEntityRelationElectionTarget>>> {
  if (pairs.length === 0) return []
  const ctx = await getMapperContext()
  if (!ctx) return []
  const uniquePairs = new Map<string, { subject: { id: string }; object: { id: string } }>()
  for (const pair of pairs) {
    uniquePairs.set(`${pair.rss_feed_item_id}:${pair.topic_id}`, {
      subject: { id: pair.rss_feed_item_id },
      object: { id: pair.topic_id },
    })
  }
  const relations = await writeEntityRelations(
    ctx.topicRelation,
    ctx.mapper,
    [...uniquePairs.values()],
    { query, vote: false },
  )
  const relationIds = relations.flatMap(relation => (relation.id ? [relation.id] : []))
  await upsertEntityRelationElectionVotes(
    ctx.mapper.id,
    relationIds.map(entityId => ({ entityId, score: 1 as const })),
    undefined,
    ctx.topicRelation,
    { query, enqueueVoteStats: false },
  )
  return relationIds.map(id => createEntityRelationElectionTarget(id, ctx.topicRelation.table_name))
}

/**
 * Returns topics already mapped from RSS feed category tags for a given feed item.
 * Used by the autotagger to seed its evaluation with feed-declared categories.
 */
export async function getRssFeedItemMappedTopics(
  rss_feed_item_id: string,
  limit: number,
): Promise<{ id: string; name: string }[]> {
  const { rows } = await read(
    `/* getRssFeedItemMappedTopics */
    SELECT t.id, t.name
    FROM rss_feed_item_categories rfc
    JOIN topics t ON t.id = rfc.topic_id
    WHERE rfc.rss_feed_item_id = $1
      AND rfc.topic_id IS NOT NULL
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    LIMIT $2
    `,
    [rss_feed_item_id, limit],
  )
  return rows as { id: string; name: string }[]
}
