import type { TransactionQuery } from '@data-stores/psql'

/**
 * Restarts projections for the posts of stories whose assigned RSS URL changed.
 * This belongs to the RSS-item write transaction, so recovery sees every committed
 * URL revision even when the post-commit enqueue is unavailable.
 */
export async function markStoryPostRelatedUrlProjectionsForStories(
  query: TransactionQuery,
  storyIds: readonly string[],
): Promise<boolean> {
  if (storyIds.length === 0) return false

  const { rows } = await query<{ post_id: string }>(
    `/* markStoryPostRelatedUrlProjectionsForStories */
      INSERT INTO story_post_related_url_projection_jobs (post_id, story_id)
      SELECT post_story.post_id, post_story.story_id
      FROM story_posts post_story
      JOIN posts ON posts.id = post_story.post_id
      WHERE post_story.story_id = ANY($1::uuid[])
        AND posts.deleted_at IS NULL
      ORDER BY post_story.post_id
      ON CONFLICT (post_id) DO UPDATE
      SET story_id = EXCLUDED.story_id,
          generation = story_post_related_url_projection_jobs.generation + 1,
          source_completed_at = NULL,
          lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
      RETURNING post_id`,
    [storyIds],
  )
  if (rows.length === 0) return false
  await refreshStoryPostRelatedUrlProjectionSources(
    query,
    rows.map(row => row.post_id),
  )
  return true
}

/** Capture the committed source prefix after the caller has restarted these jobs in this transaction. */
export async function refreshStoryPostRelatedUrlProjectionSources(
  query: TransactionQuery,
  postIds: readonly string[],
): Promise<{ sweep_upper_bound_source_id: string | null }[]> {
  // A restart can wait for another membership write. Read its committed changes in a fresh snapshot.
  const { rows } = await query<{ sweep_upper_bound_source_id: string | null }>(
    `/* refreshStoryPostRelatedUrlProjectionSources */
      UPDATE story_post_related_url_projection_jobs post_stories
      SET sweep_upper_bound_source_id = (
            SELECT rss_feed_items.id
            -- no-mistakes-disable-next-line postgres-required-predicates: story membership can attach already-created items, so item IDs may predate story_id
            FROM rss_feed_items
            WHERE rss_feed_items.story_id = post_stories.story_id
              AND rss_feed_items.deleted_at IS NULL
            ORDER BY rss_feed_items.id DESC
            LIMIT 1
      )
      WHERE post_stories.post_id = ANY($1::uuid[])
      RETURNING post_stories.sweep_upper_bound_source_id`,
    [postIds],
  )
  await query(
    `/* refreshStoryPostRelatedUrlProjectionSources:transferMutations */
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
    [postIds],
  )
  return rows
}
