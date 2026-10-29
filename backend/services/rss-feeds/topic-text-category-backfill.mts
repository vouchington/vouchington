import { beginTransaction } from '@data-stores/psql'
import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/backfill-categories-for-topic-aliases'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { lockTopicRssFeedAttachmentLifecycle } from '@services/post-publication/lock'
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
  await lockTopicRssFeedAttachmentLifecycle(transaction, topicId)
  const { rows: locked } = await transaction<{ rss_feed_id: string }>(
    `/* backfillTopicTextFeedPage lockCategories */
     SELECT category.rss_feed_id
     FROM UNNEST($1::uuid[], $2::uuid[]) AS raw(rss_feed_id, category_identity_id)
     JOIN rss_feed_categories category
       ON category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
     ORDER BY category.rss_feed_id, category.category_identity_id
     FOR UPDATE OF category`,
    [page.rows.map(row => row.content_id), page.rows.map(row => row.category_identity_id)],
  )
  if (locked.length === 0) {
    await transaction.commit()
    return { updated: 0, hasMore: page.hasMore, cursor: page.cursor }
  }
  const { rows: currentTopic } = await transaction<{ name: string; slug: string }>(
    `/* backfillTopicTextFeedPage currentTopic */
     SELECT LOWER(name) AS name, slug FROM topics
     WHERE id = $1::uuid AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
    [topicId],
  )
  if (
    !currentTopic[0] ||
    (page.sourcePhase === 0 && currentTopic[0].name !== page.cursor?.name) ||
    (page.sourcePhase === 1 && currentTopic[0].slug !== page.cursor?.slug)
  ) {
    await transaction.commit()
    return { updated: 0, hasMore: page.hasMore, cursor: page.cursor }
  }
  const { rowCount } = await transaction(
    `/* backfillTopicTextFeedPage update */
     UPDATE rss_feed_categories category SET topic_id = $1::uuid
     FROM UNNEST($2::uuid[], $3::uuid[]) AS raw(rss_feed_id, category_identity_id)
     WHERE category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
       AND category.topic_id IS NULL`,
    [topicId, page.rows.map(row => row.content_id), page.rows.map(row => row.category_identity_id)],
  )
  await transaction.commit()
  return { updated: rowCount ?? 0, hasMore: page.hasMore, cursor: page.cursor }
}
