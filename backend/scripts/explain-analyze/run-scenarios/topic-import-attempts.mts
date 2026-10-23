import { write } from '@data-stores/psql'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

const EXPLAIN_TOPIC_IMPORT_ATTEMPT_KEY = '019e0000-1800-7000-8000-000000000000'

export async function runTopicImportAttemptScenarios(): Promise<void> {
  const now = new Date()
  registerScenarioContract('topic-import-attempts-retention', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_user_topic_import_attempts__retention'] },
      { kind: 'custom', name: 'topicImportAttempts' },
    ],
  })
  // Profile the actual bounded candidate read of the production DELETE. A ModifyTable root
  // reports zero result rows in EXPLAIN even when its child selects a full deletion page.
  await runAndCapture('topic-import-attempts-retention', async () => {
    const { rows } = await write<{ id: string }>(
      `/* pruneExpiredTopicImportAttempts: candidate page */
      SELECT attempt.id
      FROM user_topic_import_attempts attempt
      WHERE attempt.retention_expires_at <= COALESCE($1::timestamptz, NOW())
        AND ($2::timestamptz IS NULL
          OR attempt.retention_expires_at >= $3::timestamptz)
      ORDER BY attempt.retention_expires_at, attempt.id
      LIMIT $4
      FOR UPDATE OF attempt SKIP LOCKED`,
      // No lower-bound restriction: the fixture may have been seeded hours before this probe.
      [now, null, null, 100],
    )
    if (rows.length !== 100) throw new Error('Expected a full topic-import retention page')
  })
  registerScenarioContract('topic-import-attempts-user-key', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['user_topic_import_attempts_user_key_unique'] },
      { kind: 'custom', name: 'topicImportAttempts' },
    ],
  })
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
