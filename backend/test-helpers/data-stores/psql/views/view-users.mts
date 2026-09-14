import { read, write } from '@data-stores/psql'

export async function queryEmbeddedUser(
  userId: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await read<Record<string, unknown>>(
    `/* queryEmbeddedUser */ SELECT * FROM view_embedded_users WHERE id = $1 LIMIT 1`,
    [userId],
  )
  return result.rows[0]
}

export async function setUserDisplayNameFrom(userId: string, provider: string): Promise<void> {
  await write(
    `/* setUserDisplayNameFrom */ UPDATE users SET use_display_name_from = $2 WHERE id = $1`,
    [userId, provider],
  )
}

export async function queryPostCreatedBy(
  postId: string,
): Promise<{ created_by: Record<string, unknown> | null; created_by_id: string } | undefined> {
  const result = await read<{ created_by: Record<string, unknown> | null; created_by_id: string }>(
    `/* queryPostCreatedBy */ SELECT created_by, created_by_id FROM view_posts WHERE id = $1 LIMIT 1`,
    [postId],
  )
  return result.rows[0]
}
