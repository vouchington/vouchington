import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PostStory, Story } from './types.mts'
import { invalidateStories } from './cache-invalidation.mts'

export async function updateStoryTitle(
  storyId: string,
  title: string,
  options: QueryOptions = {},
): Promise<Story | null> {
  const { rows } = await write(
    sql`/* updateStoryTitle */
    UPDATE stories
    SET title = ${title}, updated_at = CURRENT_TIMESTAMP
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
    options,
  )
  const story = (rows[0] as Story) ?? null
  if (story) await invalidateStories(story.id)
  return story
}

/**
 * Admin-only: set official item and lock it to prevent agent override.
 */
export async function adminSetStoryOfficialItem(
  storyId: string,
  officialItemId: string,
  options: QueryOptions = {},
): Promise<Story | null> {
  const { rows } = await write(
    sql`/* adminSetStoryOfficialItem */
    UPDATE stories
    SET
      official_rss_feed_item_id = ${officialItemId},
      official_locked_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
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
    options,
  )
  const story = (rows[0] as Story) ?? null
  if (story) await invalidateStories(story.id)
  return story
}

export async function createPostStory(
  postId: string,
  storyId: string,
  initiatedById: string,
  options: QueryOptions = {},
): Promise<PostStory | null> {
  const { rows } = await write(
    sql`/* createPostStory */
    INSERT INTO post__stories (post_id, story_id, initiated_by_id)
    VALUES (${postId}, ${storyId}, ${initiatedById})
    ON CONFLICT (story_id) DO NOTHING
    RETURNING post_id, story_id, initiated_by_id, created_at
  `,
    options,
  )
  const postStory = (rows[0] as PostStory) ?? null
  return postStory
}
