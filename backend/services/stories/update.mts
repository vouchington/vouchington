import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'
import { recordModeratorAction } from '@services/moderator-actions'
import { registerPostCommitAction, runWithTransaction, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PostStory, Story } from './types.mts'
import { invalidateStories } from './cache-invalidation.mts'

export async function updateStoryTitle(
  actorId: string,
  storyId: string,
  title: string,
  options: { query?: TransactionQuery } = {},
): Promise<Story | null> {
  const story = await runWithTransaction(options.query, async query => {
    const { rows } = await write(
      sql`/* updateStoryTitle */
    UPDATE stories
    SET title = ${title}
    WHERE id = ${storyId}
      AND deleted_at IS NULL
    RETURNING
      id,
      title,
      cluster_reason,
      published_at,
      official_rss_feed_item_id,
      official_locked_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at,
      deleted_at
  `,
      { query },
    )
    const story = (rows[0] as Story) ?? null
    if (story)
      await recordModeratorAction(
        actorId,
        { actionType: 'story_rename', metadata: { story_id: storyId, title } },
        { query },
      )
    if (story && options.query) registerPostCommitAction(query, () => invalidateStories(story.id))
    return story
  })
  if (story && !options.query) await invalidateStories(story.id)
  return story
}

/**
 * Admin-only: set official item and lock it to prevent agent override.
 */
export async function adminSetStoryOfficialItem(
  actorId: string,
  storyId: string,
  officialItemId: string,
  options: { query?: TransactionQuery } = {},
): Promise<Story | null> {
  const story = await runWithTransaction(options.query, async query => {
    await lockOfficialItemMembership(query, storyId, officialItemId)
    const { rows } = await write(
      sql`/* adminSetStoryOfficialItem */
    UPDATE stories
    SET
      official_rss_feed_item_id = ${officialItemId},
      official_locked_at = CURRENT_TIMESTAMP
    WHERE id = ${storyId}
      AND deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM rss_feed_items WHERE id = ${officialItemId} AND story_id = ${storyId} AND deleted_at IS NULL)
    RETURNING
      id,
      title,
      cluster_reason,
      published_at,
      official_rss_feed_item_id,
      official_locked_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at,
      deleted_at
  `,
      { query },
    )
    const story = (rows[0] as Story) ?? null
    if (story)
      await recordModeratorAction(
        actorId,
        {
          actionType: 'story_official_item_set',
          metadata: { story_id: storyId, rss_feed_item_id: officialItemId },
        },
        { query },
      )
    if (story && options.query) registerPostCommitAction(query, () => invalidateStories(story.id))
    return story
  })
  if (story && !options.query) await invalidateStories(story.id)
  return story
}

async function lockOfficialItemMembership(
  query: TransactionQuery,
  storyId: string,
  officialItemId: string,
): Promise<void> {
  await query(
    sql`/* adminSetStoryOfficialItem:lockItem */ SELECT id FROM rss_feed_items WHERE id = ${officialItemId} AND deleted_at IS NULL FOR UPDATE`,
  )
  await lockStoryLifecycles(query, [storyId])
}

export async function createPostStory(
  postId: string,
  storyId: string,
  initiatedById: string,
  options: QueryOptions = {},
): Promise<PostStory | null> {
  const { rows } = await write(
    sql`/* createPostStory */
    INSERT INTO story_posts (post_id, story_id, initiated_by_id)
    VALUES (${postId}, ${storyId}, ${initiatedById})
    ON CONFLICT (story_id) DO NOTHING
    RETURNING post_id, story_id, initiated_by_id, created_at
  `,
    options,
  )
  const postStory = (rows[0] as PostStory) ?? null
  return postStory
}
