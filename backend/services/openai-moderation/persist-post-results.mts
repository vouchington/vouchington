import { beginTransaction } from '@data-stores/psql'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import sql from 'sql-template-strings'
import type { PersistableOpenAIModerationResults } from './stored-results.mts'

export async function applyPostOpenAIModerationResults(
  postId: string,
  contentSha256: Buffer,
  results: PersistableOpenAIModerationResults,
  flagged: boolean,
): Promise<boolean> {
  await using query = await beginTransaction()
  const scope = { type: 'post' as const, postId }
  await lockPostPublication(query, postId)
  const { rows } = await query<{ publication_eligibility_changed: boolean }>(
    sql`/* applyPostOpenAIModerationResults */
        WITH target_post AS (
          SELECT id, openai_omni_moderation_flagged
          FROM posts
          WHERE id = ${postId}
            AND openai_omni_moderation_content_sha256 = ${contentSha256}
          FOR UPDATE
        )
        UPDATE posts
        SET openai_omni_moderation_input_sha256 = ${contentSha256},
          openai_omni_moderation_results = ${JSON.stringify(results)}::jsonb,
          openai_omni_moderation_flagged = ${flagged},
          openai_omni_moderation_created_at = NOW()
        FROM target_post
        WHERE posts.id = target_post.id
        RETURNING
          (target_post.openai_omni_moderation_flagged IS TRUE)
            IS DISTINCT FROM (${flagged} IS TRUE) AS publication_eligibility_changed`,
  )
  if (rows[0]?.publication_eligibility_changed) {
    await recordPostPublicationChange(query, {
      scope,
      reason: 'post_moderation_flag_changed',
    })
  }
  const result = rows.length > 0
  await query.commit()
  return result
}

/** Marks an empty post's OpenAI moderation complete so the clearance gate can proceed. */
export async function markPostOpenAIModerationNoContent(postId: string): Promise<void> {
  await using query = await beginTransaction()
  const scope = { type: 'post' as const, postId }
  await lockPostPublication(query, postId)
  const { rows } = await query<{ publication_eligibility_changed: boolean }>(
    sql`/* markPostOpenAIModerationNoContent */
        WITH target_post AS (
          SELECT id, openai_omni_moderation_flagged
          FROM posts
          WHERE id = ${postId}
            AND openai_omni_moderation_created_at IS NULL
          FOR UPDATE
        )
        UPDATE posts
        SET openai_omni_moderation_created_at = NOW(),
          openai_omni_moderation_flagged = false
        FROM target_post
        WHERE posts.id = target_post.id
        RETURNING target_post.openai_omni_moderation_flagged IS TRUE
          AS publication_eligibility_changed`,
  )
  if (rows[0]?.publication_eligibility_changed) {
    await recordPostPublicationChange(query, {
      scope,
      reason: 'post_moderation_flag_changed',
    })
  }
  await query.commit()
}
