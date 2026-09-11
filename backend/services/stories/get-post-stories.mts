import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PostStory } from './types.mts'
import type { BasicUser } from '@services/users/types'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'

export async function getPostStoryIdsByStoryIds(
  storyIds: string[],
  options: QueryOptions = {},
): Promise<Record<string, string>> {
  if (storyIds.length === 0) return {}
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery(
    sql`/* getPostStoryIdsByStoryIds */
    SELECT post_id, story_id
    FROM post__stories
    WHERE story_id = ANY(${storyIds}::uuid[])
  `,
    options,
  )
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.story_id as string] = row.post_id as string
  }
  return result
}

export async function getVisiblePostStoryIdsByStoryIds(
  currentUser: BasicUser | null,
  storyIds: string[],
  options: QueryOptions = {},
): Promise<Record<string, string>> {
  if (storyIds.length === 0) return {}
  const eligibility = currentUser
    ? buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
        currentUserId: currentUser.id,
        isAdministrator: currentUser.roles.includes('administrator'),
      })
    : buildPublicPostEligibilityFilter('candidate_post', 'root_post')
  const query = sql`/* getVisiblePostStoryIdsByStoryIds */
    SELECT post_story.post_id, post_story.story_id
    FROM post__stories post_story
    JOIN posts candidate_post ON candidate_post.id = post_story.post_id
    JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
    WHERE post_story.story_id = ANY(${storyIds}::uuid[])
      AND `.append(eligibility)
  const { rows } = await read(query, options)
  return Object.fromEntries(rows.map(row => [row.story_id as string, row.post_id as string]))
}

export async function getPostStoryByStoryId(
  storyId: string,
  options: QueryOptions = {},
): Promise<PostStory | null> {
  const { rows } = await read(
    sql`/* getPostStoryByStoryId */
    SELECT post_id, story_id, initiated_by_id, created_at
    FROM post__stories
    WHERE story_id = ${storyId}
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as PostStory) ?? null
}

export async function getPostStoryByPostId(
  postId: string,
  options: QueryOptions = {},
): Promise<PostStory | null> {
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery(
    sql`/* getPostStoryByPostId */
    SELECT post_id, story_id, initiated_by_id, created_at
    FROM post__stories
    WHERE post_id = ${postId}
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as PostStory) ?? null
}
