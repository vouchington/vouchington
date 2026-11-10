/* oxlint-disable no-await-in-loop -- Sequential bounded batches preserve lock order and cap query inputs. */
import { getRssFeedItemsWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql'
import {
  recordRssFeedTopicPublicationChanges,
  recordStoryTopicPublicationChanges,
} from '@services/post-publication'

type CategoryTopicChange = {
  rss_feed_item_id: string
  previous_topic_id: string | null
  topic_id: string | null
}

/** Establishes the item-row-first lock order shared with story assignment writers. */
export async function lockRssFeedItemsForStoryPublicationChanges(
  query: TransactionQuery,
  itemIds: readonly string[],
): Promise<void> {
  const STORY_CATEGORY_ITEM_BATCH_SIZE = getRssFeedItemsWorkLimit('story_category_item_batch_size')
  const ids = [...new Set(itemIds)].toSorted()
  // Input chunks keep every item lock statement bounded.
  for (let offset = 0; offset < ids.length; offset += STORY_CATEGORY_ITEM_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + STORY_CATEGORY_ITEM_BATCH_SIZE)
    // no-mistakes-disable-next-line query-reached-per-item: each input chunk is capped by runtime configuration; combining chunks would exceed that bound.
    await query(
      `/* lockRssFeedItemsForStoryPublicationChanges */
      SELECT id FROM rss_feed_items WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [batch],
    )
  }
}

/**
 * Coalesces category topic remaps by story without refreshing an unbounded story projection in
 * the category writer's transaction. The publication reconciler owns that later projection refresh.
 * Publication context is read without locking the stories, feeds, or items it describes.
 */
export async function recordStoryPublicationChangesForCategoryTopics(
  query: TransactionQuery,
  changes: readonly CategoryTopicChange[],
): Promise<void> {
  const STORY_CATEGORY_CHANGE_BATCH_SIZE = getRssFeedItemsWorkLimit(
    'story_category_change_batch_size',
  )
  const topicChanges = changes.filter(change => change.previous_topic_id !== change.topic_id)
  if (topicChanges.length === 0) return

  const impactsByStory = new Map<string, { postIds: Set<string>; topicIds: Set<string> }>()
  const topicIdsByRssFeed = new Map<string, Set<string>>()
  for (let offset = 0; offset < topicChanges.length; offset += STORY_CATEGORY_CHANGE_BATCH_SIZE) {
    const batch = topicChanges.slice(offset, offset + STORY_CATEGORY_CHANGE_BATCH_SIZE)
    // no-mistakes-disable-next-line query-reached-per-item: each input chunk is capped by runtime configuration; combining chunks would exceed that bound.
    const { rows } = await query<{
      post_ids: string[]
      story_id: string
      topic_ids: string[]
    }>(
      `/* recordStoryPublicationChangesForCategoryTopics */
      WITH changed_categories AS (
        SELECT rss_feed_item_id, previous_topic_id, topic_id
        FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
          AS input(rss_feed_item_id, previous_topic_id, topic_id)
      )
      SELECT item.story_id,
        ARRAY_AGG(DISTINCT topic.topic_id) FILTER (WHERE topic.topic_id IS NOT NULL) AS topic_ids,
        COALESCE(
          ARRAY_AGG(DISTINCT post_story.post_id) FILTER (WHERE post_story.post_id IS NOT NULL),
          ARRAY[]::uuid[]
        ) AS post_ids
      FROM changed_categories category
      JOIN rss_feed_items item ON item.id = category.rss_feed_item_id
      LEFT JOIN story_posts post_story ON post_story.story_id = item.story_id
      CROSS JOIN LATERAL unnest(ARRAY[category.previous_topic_id, category.topic_id]) AS topic(topic_id)
      WHERE item.story_id IS NOT NULL
      GROUP BY item.story_id
      ORDER BY item.story_id`,
      [
        batch.map(change => change.rss_feed_item_id),
        batch.map(change => change.previous_topic_id),
        batch.map(change => change.topic_id),
      ],
    )
    for (const row of rows) {
      const impacts = impactsByStory.get(row.story_id) ?? {
        postIds: new Set<string>(),
        topicIds: new Set<string>(),
      }
      for (const postId of row.post_ids) impacts.postIds.add(postId)
      for (const topicId of row.topic_ids ?? []) impacts.topicIds.add(topicId)
      impactsByStory.set(row.story_id, impacts)
    }
    // no-mistakes-disable-next-line query-reached-per-item: each input chunk is capped by runtime configuration; combining chunks would exceed that bound.
    const feedImpacts = await query<{ rss_feed_id: string; topic_ids: string[] }>(
      `/* recordUnclusteredRssFeedPublicationChangesForCategoryTopics */
      WITH changed_categories AS (
        SELECT rss_feed_item_id, previous_topic_id, topic_id
        FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
          AS input(rss_feed_item_id, previous_topic_id, topic_id)
      )
      SELECT source.rss_feed_id,
        ARRAY_AGG(DISTINCT topic.topic_id) FILTER (WHERE topic.topic_id IS NOT NULL) AS topic_ids
      FROM changed_categories category
      JOIN rss_feed_items item ON item.id = category.rss_feed_item_id
      JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
      CROSS JOIN LATERAL unnest(ARRAY[category.previous_topic_id, category.topic_id]) AS topic(topic_id)
      WHERE item.story_id IS NULL
      GROUP BY source.rss_feed_id
      ORDER BY source.rss_feed_id`,
      [
        batch.map(change => change.rss_feed_item_id),
        batch.map(change => change.previous_topic_id),
        batch.map(change => change.topic_id),
      ],
    )
    for (const row of feedImpacts.rows) {
      const topicIds = topicIdsByRssFeed.get(row.rss_feed_id) ?? new Set<string>()
      for (const topicId of row.topic_ids ?? []) topicIds.add(topicId)
      topicIdsByRssFeed.set(row.rss_feed_id, topicIds)
    }
  }
  await recordStoryTopicPublicationChanges(
    query,
    [...impactsByStory].map(([storyId, impacts]) => ({
      storyId,
      impactedTopicIds: [...impacts.topicIds],
      impactedPostIds: [...impacts.postIds],
    })),
  )
  await recordRssFeedTopicPublicationChanges(
    query,
    [...topicIdsByRssFeed].map(([rssFeedId, topicIds]) => ({
      rssFeedId,
      impactedTopicIds: [...topicIds],
    })),
  )
}
