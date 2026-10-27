import type { TransactionQuery } from '@data-stores/psql/types'
import type { TopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/types'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'

export type AliasUnlinkRow = {
  id: string
  alias: string
  unlink_topic_id: string
}

export async function lockPendingAlias(
  query: TransactionQuery,
  topicAliasId: string,
): Promise<AliasUnlinkRow | null> {
  const { rows } = await query<AliasUnlinkRow & { unlink_requested_at: Date | null }>(
    `/* lockPendingAlias */
    SELECT id, alias, unlink_topic_id, unlink_requested_at
    FROM topic_aliases
    WHERE id = $1::uuid
    FOR UPDATE`,
    [topicAliasId],
  )
  const alias = rows[0]
  if (!alias?.unlink_requested_at || !alias.unlink_topic_id) return null
  return alias
}

export async function finalizeTopicAliasUnlink(
  query: TransactionQuery,
  alias: AliasUnlinkRow,
  preservesHashtag: boolean,
): Promise<void> {
  if (preservesHashtag) {
    await query(
      `/* finalizeTopicAliasUnlink preserveHashtag */
      UPDATE topic_aliases
      SET unlink_requested_at = NULL, unlink_topic_id = NULL
      WHERE id = $1::uuid
        AND unlink_requested_at IS NOT NULL`,
      [alias.id],
    )
    return
  }
  await query(
    `/* finalizeTopicAliasUnlink deleteOrdinaryAlias */
    DELETE FROM topic_aliases
    WHERE id = $1::uuid
      AND unlink_requested_at IS NOT NULL`,
    [alias.id],
  )
}

export async function deleteTopicAliasUnlinkPhase(
  query: TransactionQuery,
  alias: AliasUnlinkRow,
  page: TopicAliasUnlinkPage,
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  const limit = getPostPublicationWorkLimit('topic_alias_unlink_page_size')
  if (page.phase === 'post_sources')
    return deletePostSources(query, alias.id, page.pageCursor, limit)
  if (page.phase === 'post_relations')
    return deletePostRelations(query, alias.id, page.pageCursor, limit)
  if (page.phase === 'rss_item_categories')
    return clearRssItemCategories(query, alias, page.pageCursor, limit)
  return deleteRssItemRelations(query, alias.id, page.pageCursor, limit)
}

async function deletePostSources(
  query: TransactionQuery,
  topicAliasId: string,
  pageCursor: string,
  limit: number,
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  const { rows } = await query<{ id: string; post_id: string }>(
    `/* deletePostSources */
    SELECT id, post_id
    FROM post_topic_alias_sources
    WHERE topic_alias_id = $1::uuid
    ORDER BY post_id DESC, id DESC
    LIMIT $2
    FOR UPDATE`,
    [topicAliasId, limit],
  )
  if (rows[0]?.id !== pageCursor) return { postIds: [], rssFeedItemIds: [] }
  await query(
    `/* deletePostSources remove */
    DELETE FROM post_topic_alias_sources AS source
    USING unnest($2::uuid[]) AS locked(id)
    WHERE source.topic_alias_id = $1::uuid
      AND source.id = locked.id`,
    [topicAliasId, rows.map(row => row.id)],
  )
  return { postIds: rows.map(row => row.post_id), rssFeedItemIds: [] }
}

async function deletePostRelations(
  query: TransactionQuery,
  topicAliasId: string,
  pageCursor: string,
  limit: number,
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  const { rows } = await query<{ subject_id: string; id: string }>(
    `/* deletePostRelations */
    SELECT subject_id, id
    -- no-mistakes-disable-next-line postgres-required-predicates: unlink drains soft-deleted alias edges before the alias row can go
    FROM relation__post__category__topic_alias
    WHERE object_id = $1::uuid
    ORDER BY subject_id, id
    LIMIT $2
    FOR UPDATE`,
    [topicAliasId, limit],
  )
  if (rows[0]?.id !== pageCursor) return { postIds: [], rssFeedItemIds: [] }
  await query(
    `/* deletePostRelations remove */
    DELETE FROM relation__post__category__topic_alias AS relation
    USING unnest($2::uuid[], $3::uuid[]) AS locked(subject_id, id)
    -- no-mistakes-disable-next-line postgres-required-predicates: paired subject and relation ids are the locked page
    WHERE relation.object_id = $1::uuid
      AND relation.subject_id = locked.subject_id
      AND relation.id = locked.id`,
    [topicAliasId, rows.map(row => row.subject_id), rows.map(row => row.id)],
  )
  return { postIds: rows.map(row => row.subject_id), rssFeedItemIds: [] }
}

async function clearRssItemCategories(
  query: TransactionQuery,
  alias: AliasUnlinkRow,
  pageCursor: string,
  limit: number,
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  const { rows } = await query<{ rss_feed_item_id: string; category_identity_id: string }>(
    `/* clearRssItemCategories */
    SELECT rss_feed_item_id, category_identity_id
    FROM rss_feed_item_categories
    WHERE topic_alias_id = $1::uuid
    ORDER BY rss_feed_item_id DESC, category_identity_id
    LIMIT $2
    FOR UPDATE`,
    [alias.id, limit],
  )
  const first = rows[0]
  if (!first || `${first.rss_feed_item_id}_${first.category_identity_id}` !== pageCursor) {
    return { postIds: [], rssFeedItemIds: [] }
  }
  await query(
    `/* clearRssItemCategories clear */
    UPDATE rss_feed_item_categories AS category
    SET topic_alias_id = NULL,
        topic_id = CASE
          WHEN category.topic_id = $2::uuid THEN NULL
          ELSE category.topic_id
        END
    FROM unnest($3::uuid[], $4::uuid[]) AS locked(rss_feed_item_id, category_identity_id)
    WHERE category.topic_alias_id = $1::uuid
      AND category.rss_feed_item_id = locked.rss_feed_item_id
      AND category.category_identity_id = locked.category_identity_id`,
    [
      alias.id,
      alias.unlink_topic_id,
      rows.map(row => row.rss_feed_item_id),
      rows.map(row => row.category_identity_id),
    ],
  )
  return { postIds: [], rssFeedItemIds: rows.map(row => row.rss_feed_item_id) }
}

async function deleteRssItemRelations(
  query: TransactionQuery,
  topicAliasId: string,
  pageCursor: string,
  limit: number,
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  const { rows } = await query<{ subject_id: string; id: string }>(
    `/* deleteRssItemRelations */
    SELECT subject_id, id
    -- no-mistakes-disable-next-line postgres-required-predicates: unlink drains soft-deleted alias edges before the alias row can go
    FROM relation__rss_feed_item__category__topic_alias
    WHERE object_id = $1::uuid
    ORDER BY subject_id, id
    LIMIT $2
    FOR UPDATE`,
    [topicAliasId, limit],
  )
  if (rows[0]?.id !== pageCursor) return { postIds: [], rssFeedItemIds: [] }
  await query(
    `/* deleteRssItemRelations remove */
    DELETE FROM relation__rss_feed_item__category__topic_alias AS relation
    USING unnest($2::uuid[], $3::uuid[]) AS locked(subject_id, id)
    -- no-mistakes-disable-next-line postgres-required-predicates: paired subject and relation ids are the locked page
    WHERE relation.object_id = $1::uuid
      AND relation.subject_id = locked.subject_id
      AND relation.id = locked.id`,
    [topicAliasId, rows.map(row => row.subject_id), rows.map(row => row.id)],
  )
  return { postIds: [], rssFeedItemIds: rows.map(row => row.subject_id) }
}
