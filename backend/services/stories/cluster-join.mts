import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'
import type { ClusterItemRow } from './cluster-fetch.mts'
import { recordStoryPostPublicationChanges } from './publication-change.mts'
import type { StoryPostRefreshResult } from './refresh-story-post.mts'
import type { ClusterDependencies, ClusterResult } from './cluster-types.mts'

/**
 * Joins the incoming item to an existing story the Choice classifier matched it to. A single
 * item's own claim is already atomic (one row, one checked UPDATE), so there is no pair-claim
 * invariant to enforce here the way there is in `cluster-create-pair.mts`'s new-story path.
 */
export async function assignItemToExistingStory(
  item: ClusterItemRow,
  storyId: string,
  dependencies: ClusterDependencies,
): Promise<ClusterResult | null> {
  let refreshResult: StoryPostRefreshResult | null = null
  await using query = await beginTransaction()
  const locked = await query(
    sql`/* assignItemToExistingStory:lockItem */
        SELECT id FROM rss_feed_items
        WHERE id = ${item.id} AND deleted_at IS NULL AND story_id IS NULL AND story_locked_at IS NULL
        FOR UPDATE`,
  )
  let result = locked
  if (locked.rows.length > 0) {
    await lockStoryLifecycles(query, [storyId])
    result = await query(
      sql`/* assignItemToExistingStory:claim */
    UPDATE rss_feed_items
    SET story_id = ${storyId}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${item.id}
      AND deleted_at IS NULL
      AND story_id IS NULL
      AND story_locked_at IS NULL
    RETURNING id
      `,
    )
    if (result.rows.length > 0) {
      refreshResult = await dependencies.refreshStoryPostForStory(
        storyId,
        { query },
        { enqueueAgent: false },
      )
      await recordStoryPostPublicationChanges(query, storyId, refreshResult?.impactedTopicIds)
    }
  }
  const { rows } = result
  await query.commit()
  if (rows.length === 0) return null
  await dependencies.completeClusteredStory(storyId, refreshResult)
  return { storyId, created: false }
}
