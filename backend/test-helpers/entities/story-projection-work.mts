import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Exact fixture identities only; an unclaimable lease is not proof of terminal absence. */
export async function readStoryProjectionWorkForTest(postIds: readonly string[]) {
  if (postIds.length === 0) return []
  const { rows } = await read<{ post_id: string; lease_token: string | null }>(
    sql`/* readStoryProjectionWorkForTest */
      SELECT post_id, lease_token
      FROM story_post_related_url_projection_jobs
      WHERE post_id = ANY(${postIds}::uuid[])
      ORDER BY post_id
      LIMIT ${postIds.length}`,
    { readOnly: false },
  )
  return rows
}
