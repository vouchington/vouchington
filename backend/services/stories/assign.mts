import { clearMovedStoryOfficialItem } from './clear-moved-official-item.mts'
import { dispatchPostCommitEffectsBestEffort } from './assignment-effects.mts'
import { recordModeratorAction } from '@services/moderator-actions'
import { runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkStoryPostAgents } from '@queues/ai-agents/enqueues/story-post'
import { refreshStoryPostForStory, type StoryPostRefreshResult } from './refresh-story-post.mts'
import { invalidateStories } from './cache-invalidation.mts'
import { recordPostPublicationChange } from '@services/post-publication'
import { getPostStoryIdsByStoryIds } from './get-post-stories.mts'
/**
 * Admin-only: assign item to story and lock the assignment.
 * Refreshes story-posts before invalidating stories after a successful assignment.
 */
export async function adminAssignItemToStory(
  actorId: string,
  storyId: string,
  itemId: string,
): Promise<string | null> {
  let afterCommit: (() => Promise<void>) | undefined
  const assignedId = await runWithTransaction(undefined, async (query: TransactionQuery) => {
    const refreshResults: StoryPostRefreshResult[] = []
    const {
      rows: [row],
    } = await query<{ id: string; prior_story_id: string | null }>(
      sql`/* adminAssignItemToStory */
      UPDATE rss_feed_items
      SET story_id = ${storyId}, story_locked_at = CURRENT_TIMESTAMP
      WHERE id = ${itemId} AND deleted_at IS NULL
      RETURNING rss_feed_items.id, old.story_id AS prior_story_id`,
    )
    if (row) {
      if (row.prior_story_id !== storyId)
        await clearMovedStoryOfficialItem(query, row.prior_story_id, itemId)
      const affectedStoryIds = [
        ...new Set(
          [storyId, row.prior_story_id].filter(
            (candidate): candidate is string => candidate !== null,
          ),
        ),
      ]
      const affectedPostIds = await getPostStoryIdsByStoryIds(affectedStoryIds, { query })
      // Assignment and batch RSS projection restarts visit the same job keys in post-ID order.
      const [first, second] = Object.entries(affectedPostIds).toSorted(([, left], [, right]) =>
        left.localeCompare(right, 'en'),
      )
      if (first) {
        const refreshed = await refreshAssignedStoryPost(query, first)
        if (refreshed) refreshResults.push(refreshed)
      }
      if (second) {
        const refreshed = await refreshAssignedStoryPost(query, second)
        if (refreshed) refreshResults.push(refreshed)
      }
    }
    if (row)
      await recordModeratorAction(
        actorId,
        {
          actionType: 'story_item_add',
          metadata: {
            story_id: storyId,
            rss_feed_item_id: itemId,
            prior_story_id: row.prior_story_id,
          },
        },
        { query },
      )
    if (!row) return null
    afterCommit = async () => {
      await dispatchPostCommitEffectsBestEffort(refreshResults)
      void enqueueBulkStoryPostAgents(
        refreshResults.map(({ postId }) => postId),
        { force: true },
      )
      await invalidateStories(storyId, row.prior_story_id)
    }
    return row.id
  })
  await afterCommit?.()
  return assignedId
}
/**
 * Admin-only: remove item from its story and lock to prevent re-assignment.
 * Refreshes the former story-post before invalidating stories.
 */
export async function adminRemoveItemFromStory(
  actorId: string,
  itemId: string,
  dependencies: { expectedStoryId?: string } = {},
): Promise<string | null> {
  let refreshResults: StoryPostRefreshResult[] = []
  let afterCommit: (() => Promise<void>) | undefined
  const removedId = await runWithTransaction(undefined, async (query: TransactionQuery) => {
    const expectedStoryId = dependencies.expectedStoryId ?? null
    const {
      rows: [row],
    } = await query<{ id: string; prior_story_id: string | null }>(
      sql`/* adminRemoveItemFromStory */
      UPDATE rss_feed_items
      SET story_id = NULL, story_locked_at = CURRENT_TIMESTAMP
      WHERE id = ${itemId}
        AND deleted_at IS NULL
        AND (${expectedStoryId}::uuid IS NULL OR story_id = ${expectedStoryId}::uuid)
      RETURNING rss_feed_items.id, old.story_id AS prior_story_id`,
    )
    if (row?.prior_story_id) {
      const priorStoryId = row.prior_story_id
      await clearMovedStoryOfficialItem(query, priorStoryId, itemId)
      const refreshResult = await refreshStoryPostForStory(priorStoryId, { query })
      if (refreshResult) {
        refreshResults = [refreshResult]
        await recordPostPublicationChange(query, {
          scope: { type: 'post', postId: refreshResult.postId },
          reason: 'post_updated',
          impactedTopicIds: refreshResult.impactedTopicIds,
        })
      }
    }
    if (row)
      await recordModeratorAction(
        actorId,
        {
          actionType: 'story_item_remove',
          metadata: { story_id: row.prior_story_id, rss_feed_item_id: itemId },
        },
        { query },
      )
    if (!row) return null
    afterCommit = async () => {
      await dispatchPostCommitEffectsBestEffort(refreshResults)
      void enqueueBulkStoryPostAgents(
        refreshResults.map(({ postId }) => postId),
        { force: true },
      )
      await invalidateStories(row.prior_story_id)
    }
    return row.id
  })
  await afterCommit?.()
  return removedId
}

async function refreshAssignedStoryPost(
  query: TransactionQuery,
  [storyId, expectedPostId]: [string, string],
): Promise<StoryPostRefreshResult | null> {
  const result = await refreshStoryPostForStory(storyId, { query, expectedPostId })
  if (result) {
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: result.postId },
      reason: 'post_updated',
      impactedTopicIds: result.impactedTopicIds,
    })
  }
  return result
}
