import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

/** One feed source page; a story has at most one linked post. */
export async function listLiveFeedItemsPage(feedId: string, afterId: string | null) {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ item_id: string; post_id: string | null }>(
    `/* listLiveFeedItemsPage */
    WITH page AS MATERIALIZED (
      SELECT source.rss_feed_item_id AS item_id
      FROM rss_feed_item_sources source
      WHERE source.rss_feed_id = $1::uuid
        AND source.rss_feed_item_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY source.rss_feed_item_id LIMIT $3
    )
    SELECT page.item_id, story_post.post_id
    FROM page
    LEFT JOIN LATERAL (
      SELECT story_id FROM rss_feed_items WHERE id = page.item_id LIMIT 1
    ) item ON true
    LEFT JOIN LATERAL (
      SELECT post_id FROM story_posts WHERE story_id = item.story_id LIMIT 1
    ) story_post ON true
    ORDER BY page.item_id`,
    [feedId, afterId, limit],
  )
  return {
    itemIds: rows.map(row => row.item_id),
    postIds: rows.flatMap(row => (row.post_id ? [row.post_id] : [])),
    cursor: rows.length === limit ? rows.at(-1)!.item_id : null,
  }
}

/** Current feed-owned categories have a composite feed/category identity index. */
export async function listLiveFeedCategoriesPage(feedId: string, afterId: string | null) {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ category_identity_id: string; topic_id: string | null }>(
    `/* listLiveFeedCategoriesPage */
    SELECT category_identity_id, topic_id FROM rss_feed_categories
    WHERE rss_feed_id = $1::uuid
      AND category_identity_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY category_identity_id LIMIT $3`,
    [feedId, afterId, limit],
  )
  return {
    topicIds: rows.flatMap(row => (row.topic_id ? [row.topic_id] : [])),
    cursor: rows.length === limit ? rows.at(-1)!.category_identity_id : null,
  }
}

/** An item may aggregate categories from arbitrarily many feeds; page its global union. */
export async function listLiveItemCategoriesPage(itemId: string, afterId: string | null) {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{
    category_identity_id: string
    topic_id: string | null
    alias: string | null
    alias_topic_id: string | null
  }>(
    `/* listLiveItemCategoriesPage */
    SELECT category.category_identity_id, category.topic_id,
      alias.alias, alias.topic_id AS alias_topic_id
    FROM rss_feed_item_categories category
    LEFT JOIN topic_aliases alias ON alias.id = category.topic_alias_id
    WHERE category.rss_feed_item_id = $1::uuid
      AND category.category_identity_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY category.category_identity_id LIMIT $3`,
    [itemId, afterId, limit],
  )
  return {
    topicIds: [
      ...new Set(
        rows.flatMap(row => [row.topic_id, row.alias_topic_id].filter((id): id is string => !!id)),
      ),
    ],
    aliases: rows.flatMap(row => (row.alias ? [row.alias] : [])),
    cursor: rows.length === limit ? rows.at(-1)!.category_identity_id : null,
  }
}
