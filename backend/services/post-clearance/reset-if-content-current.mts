import { beginTransaction } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import sql from 'sql-template-strings'
import { resetPostClearance } from './reset-clearance.mts'
import { lockPostPublication } from '@services/post-publication'

export async function resetPostClearanceIfContentCurrent(
  postId: string,
  contentSha256: Buffer,
): Promise<boolean> {
  let clearanceChanged = false
  await using query = await beginTransaction()
  const contentCurrent = await resetClearanceWhenContentCurrent()
  await query.commit()
  if (clearanceChanged) await invalidate.posts(postId)
  return contentCurrent

  async function resetClearanceWhenContentCurrent(): Promise<boolean> {
    await lockPostPublication(query, postId)
    const { rows } = await query(sql`/* resetPostClearanceIfContentCurrent */
      SELECT id
      FROM posts
      WHERE id = ${postId}
        AND llm_moderation_content_sha256 = ${contentSha256}
      FOR UPDATE
    `)
    if (rows.length === 0) return false
    clearanceChanged = await resetPostClearance(postId, null, { query })
    return true
  }
}
