import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import { refreshStoryPostForStory, type StoryPostRefreshResult } from './refresh-story-post.mts'
import { invalidateStories } from './cache-invalidation.mts'
import { recordPostPublicationChange } from '@services/post-publication'

type AssignmentDependencies = {
  refreshStoryPostForStory?: typeof refreshStoryPostForStory
  invalidateStories?: typeof invalidateStories
  enqueueStoryPostAgent?: typeof enqueueStoryPostAgent
  onError?: typeof onError
}

/**
 * Admin-only: assign item to story and lock the assignment.
 * Refreshes story-posts before invalidating stories after a successful assignment.
 */
export async function adminAssignItemToStory(
  storyId: string,
  itemId: string,
  dependencies: AssignmentDependencies = {},
): Promise<string | null> {
  const refreshStoryPost = dependencies.refreshStoryPostForStory ?? refreshStoryPostForStory
  const enqueueStoryPost = dependencies.enqueueStoryPostAgent ?? enqueueStoryPostAgent
  const reportError = dependencies.onError ?? onError
  let refreshResults: Array<{ storyId: string; result: StoryPostRefreshResult | null }> = []

  // Use a CTE to capture the old story_id before the SET clause overwrites it.
  // PostgreSQL RETURNING reflects post-update values, so story_id would already be
  // the new value after the SET — same pattern as adminRemoveItemFromStory.
  await using query = await beginTransaction()
  const result = await query(
    sql`/* adminAssignItemToStory */
    WITH old AS (
      SELECT id, story_id
      FROM rss_feed_items
      WHERE id = ${itemId}
        AND deleted_at IS NULL
      FOR UPDATE
    ), locked AS (
      SELECT pg_advisory_xact_lock(hashtextextended('story-lifecycle:' || lifecycle.story_id::text, 0))
      FROM (
        SELECT ${storyId}::uuid AS story_id
        UNION
        SELECT story_id FROM old WHERE story_id IS NOT NULL
      ) lifecycle
      ORDER BY lifecycle.story_id
    )
    UPDATE rss_feed_items
    SET
      story_id = ${storyId},
      story_locked_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    FROM old, locked
    WHERE rss_feed_items.id = old.id
    RETURNING rss_feed_items.id, old.story_id AS prior_story_id
      `,
  )
  const row = result.rows[0] as { id: string; prior_story_id: string | null } | undefined
  if (row) {
    const affectedStoryIds = [
      ...new Set(
        [storyId, row.prior_story_id].filter(
          (candidate): candidate is string => candidate !== null,
        ),
      ),
    ].sort()
    for (const affectedStoryId of affectedStoryIds) {
      // oxlint-disable-next-line no-await-in-loop -- sorted refreshes acquire story relation locks in one global order.
      const refreshResult = await refreshStoryPost(
        affectedStoryId,
        { query },
        { enqueueAgent: false },
      )
      refreshResults.push({ storyId: affectedStoryId, result: refreshResult })
      if (refreshResult) {
        // oxlint-disable-next-line no-await-in-loop -- capture follows the same global story order as refresh.
        await recordPostPublicationChange(query, {
          scope: { type: 'post', postId: refreshResult.postId },
          reason: 'post_updated',
          impactedTopicIds: refreshResult.impactedTopicIds,
        })
      }
    }
  }
  const { rows } = result
  await query.commit()
  if (!rows[0]) return null
  const priorStoryId = rows[0].prior_story_id as string | null
  await dispatchPostCommitEffectsBestEffort(
    refreshResults.flatMap(({ result }) => (result ? [result] : [])),
    reportError,
  )
  for (const { result } of refreshResults) {
    if (result) enqueueStoryPost(result.postId, { force: true })
  }
  await (dependencies.invalidateStories ?? invalidateStories)(storyId, priorStoryId)
  return rows[0].id as string
}

/**
 * Admin-only: remove item from its story and lock to prevent re-assignment.
 * Refreshes the former story-post before invalidating stories.
 */
export async function adminRemoveItemFromStory(
  itemId: string,
  dependencies: AssignmentDependencies = {},
): Promise<string | null> {
  const refreshStoryPost = dependencies.refreshStoryPostForStory ?? refreshStoryPostForStory
  const enqueueStoryPost = dependencies.enqueueStoryPostAgent ?? enqueueStoryPostAgent
  const reportError = dependencies.onError ?? onError
  let refreshResults: StoryPostRefreshResult[] = []

  // Use a CTE to capture the old story_id before the SET clause nulls it.
  // PostgreSQL RETURNING reflects post-update values, so story_id would be NULL after SET.
  await using query = await beginTransaction()
  const result = await query(
    sql`/* adminRemoveItemFromStory */
    WITH old AS (
      SELECT id, story_id
      FROM rss_feed_items
      WHERE id = ${itemId}
        AND deleted_at IS NULL
      FOR UPDATE
    ), locked AS (
      SELECT 1
      FROM old
      LEFT JOIN LATERAL (
        SELECT pg_advisory_xact_lock(hashtextextended('story-lifecycle:' || old.story_id::text, 0))
        WHERE old.story_id IS NOT NULL
      ) advisory ON TRUE
    )
    UPDATE rss_feed_items
    SET
      story_id = NULL,
      story_locked_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    FROM old, locked
    WHERE rss_feed_items.id = old.id
    RETURNING rss_feed_items.id, old.story_id AS prior_story_id
      `,
  )
  const row = result.rows[0] as { id: string; prior_story_id: string | null } | undefined
  if (row?.prior_story_id) {
    const priorStoryId = row.prior_story_id
    const refreshResult = await refreshStoryPost(priorStoryId, { query }, { enqueueAgent: false })
    if (refreshResult) {
      refreshResults = [refreshResult]
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId: refreshResult.postId },
        reason: 'post_updated',
        impactedTopicIds: refreshResult.impactedTopicIds,
      })
    }
  }
  const { rows } = result
  await query.commit()
  if (!rows[0]) return null
  const priorStoryId = rows[0].prior_story_id as string | null
  await dispatchPostCommitEffectsBestEffort(refreshResults, reportError)
  for (const refreshResult of refreshResults)
    enqueueStoryPost(refreshResult.postId, { force: true })
  await (dependencies.invalidateStories ?? invalidateStories)(priorStoryId)
  return rows[0].id as string
}

async function dispatchPostCommitEffectsBestEffort(
  refreshResults: StoryPostRefreshResult[],
  reportError: typeof onError,
): Promise<void> {
  const results = await Promise.allSettled(
    refreshResults.map(refreshResult => refreshResult.dispatchPostCommitEffects()),
  )
  for (const result of results) {
    if (result.status === 'rejected')
      reportError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
  }
}
