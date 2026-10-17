import sql, { type SQLStatement } from 'sql-template-strings'
import { write, type QueryOptions } from '@data-stores/psql'

/** Reads both post roles in one statement while retaining their different visibility filters. */
export async function selectAccessiblePostIdsByRole(
  groups: ReadonlyArray<{
    role: 'subject' | 'object'
    ids: readonly string[]
    filter: SQLStatement | null
  }>,
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
