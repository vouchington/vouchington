import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function countPostImageRevisions(postId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countPostImageRevisions */
    SELECT count(*)::int AS count
    FROM post_revisions
    WHERE post_id = ${postId}
      AND changes ? 'post_images'
  `)
  return rows[0]?.count ?? 0
}
