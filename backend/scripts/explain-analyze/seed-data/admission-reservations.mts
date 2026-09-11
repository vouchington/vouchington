import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const EXPLAIN_ADMISSION_RESERVATION_SEED_COUNT = 25_000

export async function seedCommittedPostAdmissionReservations(
  count = EXPLAIN_ADMISSION_RESERVATION_SEED_COUNT,
): Promise<void> {
  console.log(`Seeding ${count} committed post admission reservations...`)
  await write(
    `/* seedExplainData */ WITH seed_posts AS (
      SELECT id, created_by_id, row_number() OVER (ORDER BY id) - 1 AS seed_index
      FROM posts
      WHERE title LIKE 'Seed Post %'
      ORDER BY id
      LIMIT $1
    )
    INSERT INTO post_admission_reservations (
      actor_id, idempotency_key, intent_sha256, route, scope, source, post_type,
      policy_revision, state, response, replay_metadata, committed_post_id,
      committed_status, committed_at, expires_at, retention_expires_at
    )
    SELECT
      created_by_id,
      format('019e0000-1600-7000-8000-%s', lpad(seed_index::text, 12, '0'))::uuid,
      repeat('0', 64),
      'explain-admission', 'post', 'api', 'discussion', 'explain-seed', 'committed',
      '{}'::jsonb, '{"finalization":"pending"}'::jsonb, id, 'created', NOW(),
      NOW() + INTERVAL '48 hours', NOW() + INTERVAL '48 hours'
    FROM seed_posts
    ON CONFLICT DO NOTHING`,
    [count],
  )
  await write(
    `/* seedExplainData */ INSERT INTO post_admission_reservations (
      actor_id, idempotency_key, intent_sha256, route, scope, source, post_type,
      policy_revision, state, response, replay_metadata, committed_post_id,
      committed_status, committed_at, expires_at, retention_expires_at
    )
    SELECT
      created_by_id, '019e0000-1600-7000-8000-999999999999'::uuid, repeat('0', 64),
      'explain-admission', 'post', 'api', 'discussion', 'explain-seed', 'committed',
      '{}'::jsonb, '{"finalization":"pending"}'::jsonb, id, 'created', NOW(),
      NOW() + INTERVAL '48 hours', NOW() + INTERVAL '48 hours'
    FROM posts
    WHERE id = $1
    ON CONFLICT DO NOTHING`,
    [seedUuid(0, '05')],
  )
  await write(
    `/* seedExplainData */ INSERT INTO post_category_finalizations (
      post_id, actor_user_ids, topic_category_owner_id, generation,
      admission_response_generation, admission_response_topic_ids
    ) VALUES ($1, ARRAY[$2]::uuid[], $2, 1, 1, '{}'::uuid[])
    ON CONFLICT (post_id) DO NOTHING`,
    [seedUuid(0, '05'), seedUuid(0, '01')],
  )
}
