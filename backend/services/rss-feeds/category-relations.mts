import { read } from '@data-stores/psql'
import onError from '@modules/on-error'
import { getSystemUserByUsername } from '@services/users/system-users'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import type { BasicUser } from '@services/users/types'
import { getRssFeedCategories } from './categories.mts'

// Lazy-cached mapper context; resolved once per process lifetime.
let mapperContext: { mapper: BasicUser; relation: EntityRelationMetadata } | null = null

async function getMapperContext(): Promise<{
  mapper: BasicUser
  relation: EntityRelationMetadata
} | null> {
  if (mapperContext) return mapperContext
  const mapper = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
  if (!mapper) return null
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'topic',
    objectType: 'topic',
    predicate: 'category',
  })
  mapperContext = { mapper, relation }
  return mapperContext
}

/**
 * Seeds category entity relations for a podcast show's topic from its Apple itunes:category
 * mappings. For each rss_feed_categories row with a resolved topic_id, upserts a
 * relation__topic__category__topic row voted by the low-weight rss-feed-categorizer system user.
 *
 * This runs after upsertRssFeedCategories so topic_id is already resolved.
 * Add-only: categorizer votes are never retracted when a publisher drops a genre.
 */
export async function createFeedCategoryRelations(rssFeedId: string): Promise<void> {
  const ctx = await getMapperContext()
  /* v8 ignore start -- only reachable if rss-feed-categorizer user absent; db:migrate always seeds it */
  if (!ctx) {
    onError(
      new Error(
        `System user '${RSS_FEED_CATEGORIZER_USERNAME}' not found — cannot create feed category relations`,
      ),
    )
    return
  }
  /* v8 ignore stop */

  const showTopicId = await getRssFeedTopicId(rssFeedId)
  if (!showTopicId) return

  const categories = await getRssFeedCategories(rssFeedId)
  const topicIds = new Set<string>()
  for (const { topic_id } of categories) {
    if (topic_id) topicIds.add(topic_id)
  }
  if (topicIds.size === 0) return

  const { mapper, relation } = ctx
  await upsertEntityRelation(
    mapper,
    relation,
    { id: showTopicId },
    Array.from(topicIds).map(id => ({ id })),
    { vote: true },
  )
}

async function getRssFeedTopicId(rssFeedId: string): Promise<string | null> {
  const { rows } = await read(
    `/* getRssFeedTopicId */
     SELECT rf.topic_id FROM rss_feeds rf
     JOIN topics t ON t.id = rf.topic_id AND t.deleted_at IS NULL AND t.merged_into_topic_id IS NULL
     WHERE rf.id = $1 AND rf.deleted_at IS NULL`,
    [rssFeedId],
  )
  const row = rows[0] as { topic_id: string } | undefined
  return row?.topic_id ?? null
}
