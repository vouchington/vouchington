import { read, write } from '@data-stores/psql'
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

export async function getLatestPostCategoryRevisionForTest(
  postId: string,
): Promise<{ before: unknown; after: unknown } | undefined> {
  const { rows } = await write<{ category_change: { before: unknown; after: unknown } }>(sql`
    /* getLatestPostCategoryRevisionForTest */
    SELECT changes->'categories' AS category_change
    FROM post_revisions
    WHERE post_id = ${postId}
      AND revision_type = 'update'
      AND changes ? 'categories'
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.category_change
}
