import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getPostDeletedById(
  postId: string,
): Promise<{ deleted_by_id: string | null } | null> {
  const { rows } = await read(sql`/* getPostDeletedById */
    SELECT deleted_by_id
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0] ?? null
}

export async function getPostArchivedFields(
  postId: string,
): Promise<{ archived_at: Date | null; archived_by_id: string | null } | null> {
  const { rows } = await read(sql`/* getPostArchivedFields */
    SELECT archived_at, archived_by_id
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0] ?? null
}

export async function getTestPostCreationSourceUrlId(postId: string): Promise<string | null> {
  const { rows } = await read<{
    creation_source_url_id: string | null
  }>(sql`/* getTestPostCreationSourceUrlId */
    SELECT creation_source_url_id FROM posts WHERE id = ${postId} LIMIT 1
  `)
  return rows[0]?.creation_source_url_id ?? null
}

export async function getPostLockedFields(
  postId: string,
): Promise<{ locked_at: Date | null; locked_by_id: string | null } | null> {
  const { rows } = await read(sql`/* getPostLockedFields */
    SELECT pl.created_at AS locked_at, pl.locked_by_id
    FROM posts p
    LEFT JOIN LATERAL (
      SELECT created_at, locked_by_id
      FROM post_locks
      WHERE post_id = p.id
        AND lifted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    ) pl ON true
    WHERE p.id = ${postId}
  `)
  return rows[0] ?? null
}
