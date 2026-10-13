import { read, type QueryExecutor, type QueryOptions } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import { isModerationStaff } from '@services/users'
import { buildDirectPostEligibilityFilter } from '@modules/feed-query-builders'

export type PostAccessInput = { id: string }

/**
 * Checks whether the current user can view a batch of posts.
 */
export async function canViewPostsBatch(
  currentUser: PrivateUser | null,
  posts: PostAccessInput[],
  options: QueryOptions = {},
): Promise<Map<string, boolean>> {
  if (posts.length === 0) return new Map()

  const uniquePosts = [...new Map(posts.map(post => [post.id, post])).values()]
  const eligibility = buildDirectPostEligibilityFilter('candidate_post', 'access_post', {
    currentUserId: currentUser?.id ?? null,
    isModerationStaff: isModerationStaff(currentUser),
  })
  const query = sql`input(post_id) AS (
      SELECT UNNEST(${uniquePosts.map(post => post.id)}::uuid[])
    )
    SELECT candidate_post.id AS post_id
    FROM input
    JOIN posts candidate_post ON candidate_post.id = input.post_id
    JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
    WHERE `.append(eligibility)
  const select = (execute: QueryExecutor) =>
    execute<{ post_id: string }>(
      `/* canViewPostsBatch */
    WITH ${query.text}`,
      query.values,
    )
  const { rows } = options.query
    ? await select(options.query)
    : await select((input, values) => read(input, values, options))
  const visible = new Set(rows.map(row => row.post_id))
  return new Map(posts.map(post => [post.id, visible.has(post.id)]))
}
