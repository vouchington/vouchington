import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

const MIN_UUID = '00000000-0000-0000-0000-000000000000'
type IdPage = { ids: string[]; cursor: string | null }

/** Every branch uses a topic-first keyset index and reads at most one configured page. */
export async function listLiveTopicMergePostsPage(
  topicId: string,
  after: string | null,
): Promise<IdPage> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ id: string }>(
    `/* listLiveTopicMergePostsPage */
    WITH candidates AS MATERIALIZED (
      (SELECT post_id AS id FROM post_data_point_topics
        WHERE topic_id = $1::uuid AND post_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY post_id LIMIT $3)
      UNION ALL (SELECT post_id FROM post_explicit_topic_categories
        WHERE topic_id = $1::uuid AND post_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY post_id LIMIT $3)
      UNION ALL (SELECT post_id FROM post_review_topic_ratings
        WHERE topic_id = $1::uuid AND post_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY post_id LIMIT $3)
      UNION ALL (SELECT post_id FROM post_topic_recommendations
        WHERE created_topic_id = $1::uuid AND post_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY post_id LIMIT $3)
      UNION ALL (SELECT subject_id FROM relation__post__category__topic
        WHERE object_id = $1::uuid AND subject_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY subject_id LIMIT $3)
      UNION ALL (SELECT subject_id FROM relation__post__mentioned__topic
        WHERE object_id = $1::uuid AND subject_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY subject_id LIMIT $3)
      UNION ALL (SELECT object_id FROM relation__topic__related__post
        WHERE subject_id = $1::uuid AND object_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY object_id LIMIT $3)
      UNION ALL (SELECT object_id FROM relation__topic__mentioned__post
        WHERE subject_id = $1::uuid AND object_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY object_id LIMIT $3)
      UNION ALL (SELECT object_id FROM relation__topic__faq__post
        WHERE subject_id = $1::uuid AND object_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY object_id LIMIT $3)
    )
    SELECT DISTINCT id FROM candidates ORDER BY id LIMIT $3`,
    [topicId, after, limit, MIN_UUID],
  )
  return page(rows, limit)
}

/** Direct feed ownership and feed-category rows both survive a topic merge. */
export async function listLiveTopicMergeFeedsPage(
  topicId: string,
  after: string | null,
): Promise<IdPage> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ id: string }>(
    `/* listLiveTopicMergeFeedsPage */
    WITH candidates AS MATERIALIZED (
      (SELECT id FROM rss_feeds WHERE topic_id = $1::uuid
        AND deleted_at IS NULL AND id > COALESCE($2::uuid, $4::uuid)
        ORDER BY id LIMIT $3)
      UNION ALL (SELECT category.rss_feed_id FROM rss_feed_categories category
        JOIN rss_feeds feed ON feed.id = category.rss_feed_id AND feed.deleted_at IS NULL
        WHERE category.topic_id = $1::uuid
          AND category.rss_feed_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY category.rss_feed_id LIMIT $3)
    )
    SELECT DISTINCT id FROM candidates ORDER BY id LIMIT $3`,
    [topicId, after, limit, MIN_UUID],
  )
  return page(rows, limit)
}

/** Item categories can belong to feeds other than the topic's own feed. */
export async function listLiveTopicMergeItemsPage(
  topicId: string,
  after: string | null,
): Promise<IdPage> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ id: string }>(
    `/* listLiveTopicMergeItemsPage */
    WITH candidates AS MATERIALIZED (
      (SELECT rss_feed_item_id AS id FROM rss_feed_item_categories
        WHERE topic_id = $1::uuid AND rss_feed_item_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY rss_feed_item_id LIMIT $3)
      UNION ALL (SELECT subject_id FROM relation__rss_feed_item__category__topic
        WHERE object_id = $1::uuid AND subject_id > COALESCE($2::uuid, $4::uuid)
        ORDER BY subject_id LIMIT $3)
    )
    SELECT DISTINCT id FROM candidates ORDER BY id LIMIT $3`,
    [topicId, after, limit, MIN_UUID],
  )
  return page(rows, limit)
}

/** One item's many-to-many source feed fanout has its own indexed continuation. */
export async function listLiveItemSourceFeedsPage(
  itemId: string,
  after: string | null,
): Promise<IdPage> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ id: string }>(
    `/* listLiveItemSourceFeedsPage */
    SELECT source.rss_feed_id AS id FROM rss_feed_item_sources source
    JOIN rss_feeds feed ON feed.id = source.rss_feed_id AND feed.deleted_at IS NULL
    WHERE source.rss_feed_item_id = $1::uuid
      AND source.rss_feed_id > COALESCE($2::uuid, $4::uuid)
    ORDER BY source.rss_feed_id LIMIT $3`,
    [itemId, after, limit, MIN_UUID],
  )
  return page(rows, limit)
}

function page(rows: Array<{ id: string }>, limit: number): IdPage {
  return { ids: rows.map(row => row.id), cursor: rows.length === limit ? rows.at(-1)!.id : null }
}
