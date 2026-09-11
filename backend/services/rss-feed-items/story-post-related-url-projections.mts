import type { TransactionQuery } from '@data-stores/psql'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'

/**
 * Restarts projections for the posts of stories whose assigned RSS URL changed.
 * This belongs to the RSS-item write transaction, so recovery sees every committed
 * URL revision even when the post-commit enqueue is unavailable.
 */
export async function markStoryPostRelatedUrlProjectionsForStories(
  query: TransactionQuery,
  storyIds: readonly string[],
): Promise<boolean> {
  const uniqueStoryIds = [...new Set(storyIds)]
  if (uniqueStoryIds.length === 0) return false

  const postIds = await lockStoriesAndFindStoryPostIds(query, uniqueStoryIds)
  if (postIds.length === 0) return false
  await lockPostPublicationPostScopes(query, postIds)

  const { rows } = await query<{ post_id: string }>(
    `/* markStoryPostRelatedUrlProjectionsForStories */
      WITH post_stories AS (
        SELECT post_story.post_id, post_story.story_id
        FROM post__stories post_story
        JOIN posts ON posts.id = post_story.post_id
        WHERE post_story.story_id = ANY($1::uuid[])
          AND posts.deleted_at IS NULL
      ), high_waters AS (
        SELECT post_stories.post_id, post_stories.story_id,
          (
            SELECT rss_feed_items.id
            FROM rss_feed_items
            WHERE rss_feed_items.story_id = post_stories.story_id
              AND rss_feed_items.deleted_at IS NULL
            ORDER BY rss_feed_items.id DESC
            LIMIT 1
          ) AS source_high_water_id,
          (
            SELECT relation.id
            FROM relation__post__related__url relation
            WHERE relation.subject_id = post_stories.post_id
              AND relation.deleted_at IS NULL
            ORDER BY relation.id DESC
            LIMIT 1
          ) AS relation_high_water_id,
          clock_timestamp() AS relation_snapshot_at
        FROM post_stories
      ), marked AS (
        INSERT INTO story_post_related_url_projection_jobs
          (post_id, story_id, source_high_water_id, relation_high_water_id, relation_snapshot_at)
        SELECT post_id, story_id, source_high_water_id, relation_high_water_id, relation_snapshot_at
        FROM high_waters
        ORDER BY post_id
        ON CONFLICT (post_id) DO UPDATE
        SET story_id = EXCLUDED.story_id,
            generation = story_post_related_url_projection_jobs.generation + 1,
            source_high_water_id = EXCLUDED.source_high_water_id,
            relation_high_water_id = EXCLUDED.relation_high_water_id,
            relation_snapshot_at = EXCLUDED.relation_snapshot_at,
            source_cursor_id = NULL,
            source_completed_at = NULL,
            prune_cursor_id = NULL,
            lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
        RETURNING post_id
      )
      SELECT post_id FROM marked`,
    [uniqueStoryIds],
  )
  if (rows.length === 0) return false
  await query(
    `/* markStoryPostRelatedUrlProjectionsForStories:transferMutations */
      INSERT INTO story_post_related_url_projection_relation_mutations
        (post_id, generation, relation_id)
      SELECT work.post_id, work.generation, mutation.relation_id
      FROM story_post_related_url_projection_jobs work
      JOIN story_post_related_url_projection_relation_mutations mutation
        ON mutation.post_id = work.post_id
       AND mutation.generation = work.generation - 1
      WHERE work.post_id = ANY($1::uuid[])
      ORDER BY work.post_id, work.generation, mutation.relation_id
      ON CONFLICT (post_id, generation, relation_id) DO NOTHING`,
    [markedPostIds(rows)],
  )
  return true
}

async function lockStoriesAndFindStoryPostIds(
  query: TransactionQuery,
  storyIds: readonly string[],
): Promise<string[]> {
  await lockStoryLifecycles(query, storyIds)
  const { rows: postRows } = await query<{ post_id: string }>(
    `/* markStoryPostRelatedUrlProjectionsForStories:posts */
      SELECT DISTINCT post_story.post_id
      FROM post__stories post_story
      JOIN posts ON posts.id = post_story.post_id
      WHERE post_story.story_id = ANY($1::uuid[])
        AND posts.deleted_at IS NULL
      ORDER BY post_story.post_id`,
    [storyIds],
  )
  return markedPostIds(postRows)
}

function markedPostIds(rows: Array<{ post_id: string }>): string[] {
  const postIds: string[] = []
  for (const row of rows) postIds.push(row.post_id)
  return postIds
}
