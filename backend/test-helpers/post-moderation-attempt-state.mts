import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestPostModerationAttemptStateForPost(
  postId: string,
  source: 'openai_omni' | 'spam_detection',
): Promise<{
  failed_at: Date | null
  error_code: string | null
  completed_at: Date | null
  work_completed_at: Date | null
  work_lease_token: string | null
  work_leased_at: Date | null
  work_lease_expires_at: Date | null
} | null> {
  const { rows } = await read<{
    failed_at: Date | null
    error_code: string | null
    completed_at: Date | null
    work_completed_at: Date | null
    work_lease_token: string | null
    work_leased_at: Date | null
    work_lease_expires_at: Date | null
  }>(sql`/* getTestPostModerationAttemptState */
    SELECT attempt.failed_at, attempt.error_code, attempt.completed_at,
      work.completed_at AS work_completed_at, work.lease_token AS work_lease_token,
      work.leased_at AS work_leased_at, work.lease_expires_at AS work_lease_expires_at
    FROM post_moderation_attempts attempt
    JOIN post_moderation_work_items work USING (version_id, source)
    JOIN post_moderation_versions version ON version.id = attempt.version_id
    WHERE version.post_id = ${postId} AND attempt.source = ${source}::post_moderation_sources
    ORDER BY attempt.id DESC LIMIT 1
  `)
  return rows[0] ?? null
}
