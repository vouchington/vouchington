import type { TransactionQuery } from '@data-stores/psql'
import {
  lockPostPublicationRssFeedScopes,
  recordRssFeedTopicPublicationChanges,
  recordStoryTopicPublicationChanges,
} from '@services/post-publication'
import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'

type CategoryTopicChange = {
  rss_feed_item_id: string
  previous_topic_id: string | null
  topic_id: string | null
}

const STORY_CATEGORY_ITEM_BATCH_SIZE = 500
const STORY_CATEGORY_CHANGE_BATCH_SIZE = 1000

/** Establishes the item-row-first lock order shared with story assignment writers. */
export async function lockRssFeedItemsForStoryPublicationChanges(
  query: TransactionQuery,
  itemIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(itemIds)].toSorted()
  const rssFeedIds = new Set<string>()
  for (let offset = 0; offset < ids.length; offset += STORY_CATEGORY_ITEM_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + STORY_CATEGORY_ITEM_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every feed discovery query is item-batch bounded.
    const { rows } = await query<{ rss_feed_id: string }>(
      `/* getRssFeedScopesForCategoryPublicationLocks */
      SELECT DISTINCT rss_feed_id FROM rss_feed_item_sources
      WHERE rss_feed_item_id = ANY($1::uuid[]) ORDER BY rss_feed_id`,
      [batch],
    )
    for (const row of rows) rssFeedIds.add(row.rss_feed_id)
  }
  await lockPostPublicationRssFeedScopes(query, [...rssFeedIds])
  for (let offset = 0; offset < ids.length; offset += STORY_CATEGORY_ITEM_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + STORY_CATEGORY_ITEM_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- ascending batches preserve global item lock order.
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
 */
export async function recordStoryPublicationChangesForCategoryTopics(
  query: TransactionQuery,
  changes: readonly CategoryTopicChange[],
): Promise<void> {
  const topicChanges = changes.filter(change => change.previous_topic_id !== change.topic_id)
  if (topicChanges.length === 0) return

  const itemIds = [...new Set(topicChanges.map(change => change.rss_feed_item_id))].toSorted()
  await lockRssFeedItemsForStoryPublicationChanges(query, itemIds)
  const affectedStoryIds = new Set<string>()
  for (let offset = 0; offset < itemIds.length; offset += STORY_CATEGORY_ITEM_BATCH_SIZE) {
    const batch = itemIds.slice(offset, offset + STORY_CATEGORY_ITEM_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every discovery query is capped at STORY_CATEGORY_ITEM_BATCH_SIZE.
    const { rows } = await query<{ story_id: string }>(
      `/* getStoriesForCategoryPublicationLocks */
      SELECT DISTINCT story_id FROM rss_feed_items
      WHERE id = ANY($1::uuid[]) AND story_id IS NOT NULL ORDER BY story_id`,
      [batch],
    )
    for (const row of rows) affectedStoryIds.add(row.story_id)
  }
  await lockStoryLifecycles(query, [...affectedStoryIds])
  const impactsByStory = new Map<string, { postIds: Set<string>; topicIds: Set<string> }>()
  const topicIdsByRssFeed = new Map<string, Set<string>>()
  for (let offset = 0; offset < topicChanges.length; offset += STORY_CATEGORY_CHANGE_BATCH_SIZE) {
    const batch = topicChanges.slice(offset, offset + STORY_CATEGORY_CHANGE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- every association re-read is capped at STORY_CATEGORY_CHANGE_BATCH_SIZE.
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
      LEFT JOIN post__stories post_story ON post_story.story_id = item.story_id
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
    // oxlint-disable-next-line no-await-in-loop -- every unclustered feed-impact query is change-batch bounded.
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
