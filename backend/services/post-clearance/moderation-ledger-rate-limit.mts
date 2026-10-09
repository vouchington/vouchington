import { write } from '@data-stores/psql'
import type { PostModerationAttempt } from './moderation-ledger-attempts.mts'

/**
 * Withdraws an attempt the provider rejected with a 429 before it evaluated the content. A rate
 * limit says nothing about the post, so it must not spend one of the three attempts that end in
 * staff review, and it must not hold the work lease for the rest of its four minutes.
 *
 * In one statement this locks the work item that still holds the attempt's lease, deletes the
 * still-open attempt row (the unresolved reservation, not an outcome; completed and failed
 * attempts are never touched), clears the lease, gives back the claim count, and holds the work
 * item until the provider's wait has passed so the reconciler does not enqueue a competing job.
 * The hold never extends past the version's hard deadline, where unresolved work already moves to
 * staff review. The lease token fences a stale worker: once the lease expired and another worker
 * claimed the item, nothing is withdrawn. The row lock makes that fence hold against a claim that
 * is still in flight, because `DELETE ... USING` does not lock the joined work row: the claim and
 * the release serialize, and the loser re-reads the current lease token.
 */
export async function releasePostModerationAttemptForRateLimit(
  attempt: PostModerationAttempt,
  retryAfterMs: number,
): Promise<boolean> {
  const { rows } = await write<{ version_id: string }>(
    `/* releasePostModerationAttemptForRateLimit */
      WITH locked_work AS (
        SELECT work.version_id, work.source
        FROM post_moderation_work_items work
        WHERE work.version_id = $2
          AND work.source = $3::post_moderation_sources
          AND work.lease_token = $4
        FOR UPDATE OF work
      ),
      withdrawn AS (
        DELETE FROM post_moderation_attempts attempt_row
        USING locked_work
        WHERE attempt_row.id = $1
          AND attempt_row.version_id = locked_work.version_id
          AND attempt_row.source = locked_work.source
          AND attempt_row.lease_token = $4
          AND attempt_row.completed_at IS NULL
          AND attempt_row.failed_at IS NULL
        RETURNING attempt_row.version_id, attempt_row.source
      )
      UPDATE post_moderation_work_items work
      SET leased_at = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        attempt_count = GREATEST(work.attempt_count - 1, 0),
        available_at = LEAST(
          CURRENT_TIMESTAMP + $5::integer * INTERVAL '1 millisecond',
          version.deadline_at
        )
      FROM withdrawn
      JOIN post_moderation_versions version ON version.id = withdrawn.version_id
      WHERE work.version_id = withdrawn.version_id
        AND work.source = withdrawn.source
        AND work.lease_token = $4
      RETURNING work.version_id`,
    [attempt.id, attempt.version_id, attempt.source, attempt.lease_token, retryAfterMs],
  )
  return rows.length > 0
}
