import { write } from '@data-stores/psql'
import { runAndCapture, seedUser } from '../run-support.mts'

const EXPLAIN_TOPIC_IMPORT_ATTEMPT_KEY = '019e0000-1800-7000-8000-000000000000'

export async function runTopicImportAttemptScenarios(): Promise<void> {
  const now = new Date()
  const lowerBoundDate = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  await runAndCapture('topic-import-attempts-retention', () =>
    write(
      `/* pruneExpiredTopicImportAttempts */ WITH expired AS (
        SELECT attempt.id
        FROM user_topic_import_attempts attempt
        WHERE attempt.retention_expires_at <= COALESCE($1::timestamptz, NOW())
          AND ($2::timestamptz IS NULL
            OR attempt.retention_expires_at >= $3::timestamptz)
        ORDER BY attempt.retention_expires_at, attempt.id
        LIMIT $4
        FOR UPDATE OF attempt SKIP LOCKED
      )
      DELETE FROM user_topic_import_attempts
      WHERE id = ANY(ARRAY(SELECT id FROM expired))
      RETURNING id`,
      [now, lowerBoundDate, lowerBoundDate, 100],
    ),
  )
  await runAndCapture('topic-import-attempts-user-key', () =>
    write(
      `/* claimTopicImportAttempt.get */
        SELECT id, intent_sha256, response, retention_expires_at <= clock_timestamp() AS expired
        FROM user_topic_import_attempts
        WHERE user_id = $1 AND idempotency_key = $2
        FOR UPDATE`,
      [seedUser.id, EXPLAIN_TOPIC_IMPORT_ATTEMPT_KEY],
    ),
  )
}
