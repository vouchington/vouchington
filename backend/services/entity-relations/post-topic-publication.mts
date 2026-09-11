import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  recordRssFeedDiscoverabilityChanges,
  recordPostPublicationChanges,
  recordTopicAliasPublicationWork,
} from '@services/post-publication'
import {
  POST_TOPIC_CATEGORY_RELATION_TABLE as POST_TOPIC_CATEGORY_TABLE,
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE as POST_TOPIC_ALIAS_CATEGORY_TABLE,
} from './metadata.mts'

const POST_RELATED_URL_TABLE = 'relation__post__related__url'
const RSS_FEED_ITEM_TOPIC_ALIAS_CATEGORY_TABLE = 'relation__rss_feed_item__category__topic_alias'
const TOPIC_PUBLISHER_TYPE_TABLE = 'relation__topic__publisher_type__topic'
const ALIAS_RESOLUTION_BATCH_SIZE = 1000
const PUBLISHER_TYPE_RSS_FEED_BATCH_SIZE = 500

type PostTopicRelationChange = {
  subject_id: string
  object_id: string
}

export function isPostPublicationRelationTable(relationTable: string): boolean {
  return (
    isPostScopedPublicationRelationTable(relationTable) ||
    relationTable === RSS_FEED_ITEM_TOPIC_ALIAS_CATEGORY_TABLE ||
    relationTable === TOPIC_PUBLISHER_TYPE_TABLE
  )
}

export function isPostScopedPublicationRelationTable(relationTable: string): boolean {
  return (
    relationTable === POST_TOPIC_CATEGORY_TABLE ||
    relationTable === POST_TOPIC_ALIAS_CATEGORY_TABLE ||
    relationTable === POST_RELATED_URL_TABLE
  )
}

export function isRssFeedItemTopicAliasPublicationRelationTable(relationTable: string): boolean {
  return relationTable === RSS_FEED_ITEM_TOPIC_ALIAS_CATEGORY_TABLE
}

export function isTopicPublisherTypePublicationRelationTable(relationTable: string): boolean {
  return relationTable === TOPIC_PUBLISHER_TYPE_TABLE
}

/**
 * Records public-projection invalidation at the relation boundary. Callers pass the transaction
 * that changed the row, so a rollback cannot strand publication dirty work.
 */
export async function recordPostTopicRelationPublicationChanges(
  query: TransactionQuery,
  relationTable: string,
  changes: readonly PostTopicRelationChange[],
): Promise<void> {
  if (!isPostPublicationRelationTable(relationTable) || changes.length === 0) {
    return
  }

  if (relationTable === POST_RELATED_URL_TABLE) {
    await recordPostRelatedUrlPublicationChanges(
      query,
      changes.map(change => change.subject_id),
    )
    return
  }

  if (relationTable === TOPIC_PUBLISHER_TYPE_TABLE) {
    await recordPublisherTypeRelationPublicationChanges(query, changes)
    return
  }

  if (relationTable === RSS_FEED_ITEM_TOPIC_ALIAS_CATEGORY_TABLE) {
    await recordTopicAliasPublicationWork(
      query,
      changes.map(change => change.object_id),
    )
    return
  }

  const topicIdsByPostId = new Map<string, Set<string>>()
  if (relationTable === POST_TOPIC_CATEGORY_TABLE) {
    for (const { subject_id: postId, object_id: topicId } of changes)
      addTopicId(topicIdsByPostId, postId, topicId)
  } else {
    const aliasesById = await getCanonicalTopicIdsByAliasId(query, [
      ...new Set(changes.map(change => change.object_id)),
    ])
    for (const { subject_id: postId, object_id: aliasId } of changes) {
      const topicIds = topicIdsByPostId.get(postId) ?? new Set<string>()
      topicIdsByPostId.set(postId, topicIds)
      const topicId = aliasesById.get(aliasId)
      if (topicId) topicIds.add(topicId)
    }
  }

  await recordPostPublicationChanges(
    query,
    'post_topics_changed',
    [...topicIdsByPostId].map(([postId, topicIds]) => ({
      postId,
      impactedTopicIds: [...topicIds],
    })),
  )
}

/** Captures every feed whose discoverability derives from a changed publisher-type relation. */
async function recordPublisherTypeRelationPublicationChanges(
  query: TransactionQuery,
  changes: readonly PostTopicRelationChange[],
): Promise<void> {
  const topicIds = [...new Set(changes.map(change => change.subject_id))].toSorted()
  let afterRssFeedId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each feed fanout page is bounded and sorted.
    const result = await query<{ id: string }>(
      `/* recordPublisherTypeRelationPublicationChanges */
      SELECT id
      FROM rss_feeds
      WHERE topic_id = ANY($1::uuid[])
        AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id
      LIMIT $3`,
      [topicIds, afterRssFeedId, PUBLISHER_TYPE_RSS_FEED_BATCH_SIZE],
    )
    const rows: Array<{ id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- one set-based capture per bounded feed page.
    await recordRssFeedDiscoverabilityChanges(
      query,
      rows.map(row => row.id),
    )
    afterRssFeedId = rows.at(-1)!.id
  }
}

export async function recordPostRelatedUrlPublicationChanges(
  query: TransactionQuery,
  postIds: readonly string[],
): Promise<void> {
  await recordPostPublicationChanges(
    query,
    'post_related_urls_changed',
    postIds.map(postId => ({ postId, impactedPostIds: [postId] })),
  )
}

function addTopicId(topicIdsByPostId: Map<string, Set<string>>, postId: string, topicId: string) {
  const topicIds = topicIdsByPostId.get(postId) ?? new Set<string>()
  topicIds.add(topicId)
  topicIdsByPostId.set(postId, topicIds)
}

async function getCanonicalTopicIdsByAliasId(
  query: TransactionQuery,
  aliasIds: readonly string[],
): Promise<Map<string, string>> {
  const aliases = new Map<string, string>()
  const uniqueAliasIds = [...new Set(aliasIds)].toSorted()
  for (let offset = 0; offset < uniqueAliasIds.length; offset += ALIAS_RESOLUTION_BATCH_SIZE) {
    const batch = uniqueAliasIds.slice(offset, offset + ALIAS_RESOLUTION_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- alias resolution is capped and preserves bounded query parameters.
    const { rows } = await query<{ id: string; topic_id: string }>(
      sql`/* recordPostTopicRelationPublicationChanges:aliases */
      SELECT id, topic_id
      FROM topic_aliases
      WHERE id = ANY(${batch}::uuid[])
        AND topic_id IS NOT NULL
    `,
    )
    for (const { id, topic_id: topicId } of rows) aliases.set(id, topicId)
  }
  return aliases
}
