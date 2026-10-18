import { read, type QueryOptions } from '@data-stores/psql'
import { buildDirectPostEligibilityFilter } from '@modules/feed-query-builders'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'

/** A delegated caller must see each node and either own it or have anonymous access to it. */
export async function canViewDelegatedPostsBatch(
  user: PrivateUser,
  posts: Array<{ id: string; created_by_id?: string | null }>,
  options: QueryOptions = {},
): Promise<Map<string, boolean>> {
  if (posts.length === 0) return new Map()
  const ids = [...new Set(posts.map(post => post.id))]
  const ownedIds = posts.flatMap(post => (post.created_by_id === user.id ? [post.id] : []))
  const actorAccess = buildDirectPostEligibilityFilter('candidate_post', 'access_post', {
    currentUserId: user.id,
    isModerationStaff: isModerationStaff(user),
  })
  const anonymousAccess = buildDirectPostEligibilityFilter('candidate_post', 'access_post', {
    currentUserId: null,
    isModerationStaff: false,
  })
  const query = sql`WITH input(post_id) AS (SELECT UNNEST(${ids}::uuid[]))
    SELECT candidate_post.id AS post_id
    FROM input
    JOIN posts candidate_post ON candidate_post.id = input.post_id
    JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
    WHERE `
    .append(actorAccess)
    .append(sql` AND (`)
    .append(anonymousAccess)
    .append(sql` OR candidate_post.id = ANY(${ownedIds}::uuid[]))`)
  const { rows } = await read<{ post_id: string }>(
    `/* canViewDelegatedPostsBatch */ SELECT post_id FROM (${query.text}) AS access`,
    query.values,
    options,
  )
  const visible = new Set(rows.map(row => row.post_id))
  return new Map(posts.map(post => [post.id, visible.has(post.id)]))
}
