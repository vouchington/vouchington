import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PostRevision } from '../../services/post-revisions/index.mts'

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

export async function getPostArchiveRevisionsForTest(postId: string): Promise<PostRevision[]> {
  const { rows } = await write<PostRevision>(sql`/* getPostArchiveRevisionsForTest */
    SELECT id, post_id, revision_type, revised_by_id, changes, created_at
    FROM post_revisions
    WHERE post_id = ${postId} AND changes ? 'archived_at'
    ORDER BY id
  `)
  return rows
}

export async function getPostImageRevisionsForTest(postId: string): Promise<PostRevision[]> {
  const { rows } = await write<PostRevision>(sql`/* getPostImageRevisionsForTest */
    SELECT id, post_id, revision_type, revised_by_id, changes, created_at
    FROM post_revisions
    WHERE post_id = ${postId} AND changes ? 'post_images'
    ORDER BY id
  `)
  return rows
}
