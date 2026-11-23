import { beginTransaction } from '@data-stores/psql'
import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/backfill-categories-for-topic-aliases'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'

import { getRssFeedsWorkLimit } from './work-limits.mts'
import {
  readTopicTextCategoryRawPage,
  type TopicTextCategoryCursor,
} from './topic-text-category-raw-page.mts'

export type TopicTextBackfillResult = {
  updated: number
  hasMore: boolean
  cursor: TopicTextCategoryCursor | null
}

export async function backfillTopicTextItemPage(
  topicId: string,
  cursor: TopicTextCategoryCursor | null = null,
): Promise<TopicTextBackfillResult> {
  await using transaction = await beginTransaction()
  const page = await readTopicTextCategoryRawPage(
    transaction,
    topicId,
    'rss_feed_item_categories',
    cursor,
    getRssFeedItemsWorkLimit('category_backfill_batch_size'),
  )
  await transaction.commit()
  if (page.rows.length === 0) return { updated: 0, hasMore: page.hasMore, cursor: page.cursor }
  if (!page.cursor || page.sourcePhase === null)
    throw new Error('Topic text page with rows requires its frozen cursor')
  const result = await backfillCategoriesForTopicAliases(topicId, {
    rows: page.rows.map(row => ({
      rss_feed_item_id: row.content_id,
      category_identity_id: row.category_identity_id,
    })),
    hasMore: page.hasMore,
    match: {
      kind: 'topic_name',
      sourcePhase: page.sourcePhase,
      sourceText: page.sourcePhase === 0 ? page.cursor.name : page.cursor.slug,
    },
  })
  return { updated: result.updated, hasMore: page.hasMore, cursor: page.cursor }
}

export async function backfillTopicTextFeedPage(
  topicId: string,
  cursor: TopicTextCategoryCursor | null = null,
): Promise<TopicTextBackfillResult> {
  await using selection = await beginTransaction()
  const page = await readTopicTextCategoryRawPage(
    selection,
    topicId,
    'rss_feed_categories',
    cursor,
    getRssFeedsWorkLimit('category_backfill_batch_size'),
  )
  await selection.commit()
  if (page.rows.length === 0) return { updated: 0, hasMore: page.hasMore, cursor: page.cursor }
  await using transaction = await beginTransaction()
  const { rowCount } = await transaction(
    `/* backfillTopicTextFeedPage update */
     UPDATE rss_feed_categories category SET topic_id = $1::uuid
     FROM UNNEST($2::uuid[], $3::uuid[]) AS raw(rss_feed_id, category_identity_id)
     WHERE category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
       AND category.topic_id IS NULL
       AND EXISTS (
         SELECT 1 FROM topics
         WHERE id = $1::uuid AND deleted_at IS NULL AND merged_into_topic_id IS NULL
           AND CASE $4::integer WHEN 0 THEN LOWER(name) WHEN 1 THEN slug END = $5::text
       )`,
    [
      topicId,
      page.rows.map(row => row.content_id),
      page.rows.map(row => row.category_identity_id),
      page.sourcePhase,
      page.sourcePhase === 0 ? page.cursor?.name : page.cursor?.slug,
    ],
  )
  await transaction.commit()
  return { updated: rowCount ?? 0, hasMore: page.hasMore, cursor: page.cursor }
}
