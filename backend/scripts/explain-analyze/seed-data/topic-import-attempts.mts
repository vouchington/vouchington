import { write } from '@data-stores/psql'

export const EXPLAIN_TOPIC_IMPORT_ATTEMPT_SEED_COUNT = 25_000

export async function seedTopicImportAttempts(
  count = EXPLAIN_TOPIC_IMPORT_ATTEMPT_SEED_COUNT,
): Promise<void> {
  console.log(`Seeding ${count} topic import attempts...`)
  await write(
    `/* seedExplainData */ WITH attempt_indexes AS (
      SELECT generate_series(0, $1 - 1) AS seed_index
    )
    INSERT INTO user_topic_import_attempts (
      user_id, idempotency_key, intent_sha256, retention_expires_at
    )
    SELECT
      seed_user.id,
      format('019e0000-1800-7000-8000-%s', lpad(seed_index::text, 12, '0'))::uuid,
      repeat('0', 64),
      CASE
        WHEN seed_index < 20000 THEN NOW() - INTERVAL '1 hour' - seed_index % 60 * INTERVAL '1 minute'
        ELSE NOW() + INTERVAL '48 hours'
      END
    FROM attempt_indexes
    INNER JOIN users seed_user ON seed_user.username = format('seeduser%s', seed_index % 20000)
    ON CONFLICT DO NOTHING`,
    [count],
  )
  await write(
    `/* seedExplainData */ INSERT INTO user_topic_import_attempts (
      user_id, idempotency_key, intent_sha256, retention_expires_at
    )
    SELECT
      id, '019e0000-1900-7000-8000-000000000000'::uuid, repeat('0', 64),
      NOW() + INTERVAL '48 hours'
    FROM users
    WHERE username = 'seeduser0'
    ON CONFLICT DO NOTHING`,
  )
}
