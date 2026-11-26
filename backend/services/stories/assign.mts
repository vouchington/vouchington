import { clearMovedStoryOfficialItem } from './clear-moved-official-item.mts'
import { dispatchPostCommitEffectsBestEffort } from './assignment-effects.mts'
import { recordModeratorAction } from '@services/moderator-actions'
import { beginTransaction, runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { enqueueBulkStoryPostAgents } from '@queues/ai-agents/enqueues/story-post'
import { refreshStoryPostForStory, type StoryPostRefreshResult } from './refresh-story-post.mts'
import { invalidate } from '@services/entity-cache/invalidate'
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
    const {
      rows: [row],
    } = await query<{
      id: string
      story_id: string
      prior_story_id: string | null
      post_id: string | null
      prior_post_id: string | null
    }>(
      sql`/* adminAssignItemToStory */
      UPDATE rss_feed_items
      SET story_id = ${storyId}, story_locked_at = CURRENT_TIMESTAMP
      WHERE id = ${itemId} AND deleted_at IS NULL
      RETURNING rss_feed_items.id, new.story_id, old.story_id AS prior_story_id,
        (SELECT post_id FROM story_posts WHERE story_id = new.story_id) AS post_id,
        CASE WHEN old.story_id <> new.story_id THEN
          (SELECT post_id FROM story_posts WHERE story_id = old.story_id)
        END AS prior_post_id`,
    )
    if (!row) return null
    const priorStoryChanged = row.prior_story_id !== row.story_id
    if (priorStoryChanged) await clearMovedStoryOfficialItem(query, row.prior_story_id, itemId)
    const affectedPostIds: Record<string, string> = {}
    const missingStoryIds: string[] = []
    if (row.post_id) affectedPostIds[row.story_id] = row.post_id
    else missingStoryIds.push(row.story_id)
    if (row.prior_story_id && priorStoryChanged) {
      if (row.prior_post_id) affectedPostIds[row.prior_story_id] = row.prior_post_id
      else missingStoryIds.push(row.prior_story_id)
    }
    const refreshResults = await refreshAssignedStoryPosts(query, affectedPostIds)
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
    afterCommit = async () => {
      if (missingStoryIds.length > 0) {
        // Creation may have committed after the assignment's association lookup.
        try {
          const repaired = await refreshMissingStoryPosts(missingStoryIds)
          refreshResults.push(...repaired)
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)))
        }
      }
      await dispatchPostCommitEffectsBestEffort(refreshResults)
      const postIds = refreshResults.map(({ postId }) => postId).toSorted()
      void enqueueBulkStoryPostAgents(postIds, { force: true })
      if (postIds.length > 0) await invalidate.posts(...postIds)
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

async function refreshAssignedStoryPosts(
  query: TransactionQuery,
  postIdsByStoryId: Record<string, string>,
): Promise<StoryPostRefreshResult[]> {
  // Assignment and batch RSS projection restarts visit the same job keys in post-ID order.
  const [first, second] = Object.entries(postIdsByStoryId).toSorted(([, left], [, right]) =>
    left.localeCompare(right, 'en'),
  )
  const results: StoryPostRefreshResult[] = []
  if (first) {
    const refreshed = await refreshAssignedStoryPost(query, first)
    if (refreshed) results.push(refreshed)
  }
  if (second) {
    const refreshed = await refreshAssignedStoryPost(query, second)
    if (refreshed) results.push(refreshed)
  }
  return results
}

async function refreshMissingStoryPosts(storyIds: string[]): Promise<StoryPostRefreshResult[]> {
  await using query = await beginTransaction()
  const postIds = await getPostStoryIdsByStoryIds(storyIds, { query })
  const results = await refreshAssignedStoryPosts(query, postIds)
  await query.commit()
  return results
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
