import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'

export async function getPostIdsByCandidateRootFilter(filter: SQLStatement): Promise<string[]> {
  const query = sql`/* getPostIdsByCandidateRootFilter */
    SELECT candidate_post.id
    FROM posts candidate_post
    JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
    WHERE `.append(filter)
  const { rows } = await read<{ id: string }>(query)
  return rows.map(row => row.id)
}

export async function isPostInPublicEligibilityView(postId: string): Promise<boolean> {
  const { rowCount } = await read(sql`/* isPostInPublicEligibilityView */
    SELECT 1
    FROM view_public_post_eligibility
    WHERE post_id = ${postId}
  `)
  return rowCount === 1
}

export async function countPostOccurrencesInPublicEligibilityView(postId: string): Promise<number> {
  const { rows } = await read<{
    count: string
  }>(sql`/* countPostOccurrencesInPublicEligibilityView */
    SELECT count(*) AS count
    FROM view_public_post_eligibility
    WHERE post_id = ${postId}
  `)
  return Number(rows[0]?.count ?? 0)
}
