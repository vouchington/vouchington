import sql, { type SQLStatement } from 'sql-template-strings'
import { write, type QueryOptions } from '@data-stores/psql'

export type PostMutationSnapshot = {
  id: string
  root_post_id: string
  candidate_created_by_id: string | null
  root_created_by_id: string | null
  root_privacy: 'public' | 'private'
}

export type PostMutationAccess = {
  subjectIds: Set<string>
  objectIds: Set<string>
  snapshots: Map<string, PostMutationSnapshot>
}

type AccessGroup = {
  role: 'subject' | 'object'
  ids: readonly string[]
  filter: SQLStatement | null
}

/** Reads both post roles in one statement while retaining their different visibility filters. */
export async function selectAccessiblePostIdsByRole(
  groups: readonly AccessGroup[],
  options?: QueryOptions,
): Promise<{ subjectIds: Set<string>; objectIds: Set<string> }> {
  const result = { subjectIds: new Set<string>(), objectIds: new Set<string>() }
  const populated = groups.filter(group => group.ids.length > 0)
  if (!populated.length) return result
  const query = sql`/* getRelatablePostIds */ `
  populated.forEach((group, index) => {
    if (index) query.append(' UNION ALL ')
    query.append(sql`
      SELECT candidate_post.id, ${group.role}::text AS role
      FROM posts candidate_post
      JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      WHERE candidate_post.id = ANY(${group.ids}::uuid[])`)
    if (group.filter) query.append(sql` AND `).append(group.filter)
  })
  const { rows } = await write<{ id: string; role: 'subject' | 'object' }>(query, options)
  for (const row of rows) {
    result[row.role === 'subject' ? 'subjectIds' : 'objectIds'].add(row.id)
  }
  return result
}

/** One statement for the relatable filter and the root privacy/creator snapshot. */
export async function selectPostMutationAccess(
  groups: readonly AccessGroup[],
  options?: QueryOptions,
): Promise<PostMutationAccess> {
  const result: PostMutationAccess = {
    subjectIds: new Set(),
    objectIds: new Set(),
    snapshots: new Map(),
  }
  const populated = groups.filter(group => group.ids.length > 0)
  if (!populated.length) return result
  const query = sql`/* assertPostMutationAccess */ `
  populated.forEach((group, index) => {
    if (index) query.append(' UNION ALL ')
    query.append(sql`
      SELECT
        candidate_post.id,
        ${group.role}::text AS role,
        access_post.id AS root_post_id,
        candidate_post.created_by_id AS candidate_created_by_id,
        access_post.created_by_id AS root_created_by_id,
        access_post.privacy AS root_privacy
      FROM posts candidate_post
      JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      WHERE candidate_post.id = ANY(${group.ids}::uuid[])`)
    if (group.filter) query.append(sql` AND `).append(group.filter)
  })
  const { rows } = await write<{
    id: string
    role: 'subject' | 'object'
    root_post_id: string
    candidate_created_by_id: string | null
    root_created_by_id: string | null
    root_privacy: 'public' | 'private'
  }>(query, options)
  for (const row of rows) {
    result[row.role === 'subject' ? 'subjectIds' : 'objectIds'].add(row.id)
    result.snapshots.set(row.id, {
      id: row.id,
      root_post_id: row.root_post_id,
      candidate_created_by_id: row.candidate_created_by_id,
      root_created_by_id: row.root_created_by_id,
      root_privacy: row.root_privacy,
    })
  }
  return result
}
