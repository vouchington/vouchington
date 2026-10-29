import { write } from '@data-stores/psql'
import assert from 'node:assert/strict'
import { expireDataRequests } from '@services/account-data-requests/update'
import { claimRecoverableDataRequests } from '@services/account-data-requests/recovery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runAccountDataExportScenarios(): Promise<void> {
  await seedExpiredExports()
  await write(`/* analyzeExplainExpiredExports */ ANALYZE user_data_requests`)
  registerScenarioContract('account-data-export-expiry', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['user_data_requests__default_expires_at_id_idx'] },
      { kind: 'maxProcessedRows', relation: 'user_data_requests', max: 30 },
    ],
    seededRows: { user_data_requests: 20_222 },
    crossPartition: {
      user_data_requests: 'An export expiry can be extended beyond its request ID range.',
    },
  })
  const rearmExpiredExports = () =>
    write(`/* resetExplainExpiredExports */
      UPDATE user_data_requests SET s3_key = 'explain-export-' || id::text
      WHERE id >= '019e0000-7c07-7000-8000-000000000000'::uuid
        AND id < '019e0000-7c07-7000-8000-000000000010'::uuid`)
  try {
    await runAndCapture(
      'account-data-export-expiry',
      async () => {
        const expired = await expireDataRequests(10)
        assert.equal(expired.length, 10, 'The seeded expiry page must clear ten old exports')
        const { rows } = await write<{ expired: string; future: string }>(
          `/* assertExplainExpiredExports */
          SELECT count(*) FILTER (WHERE expires_at < NOW() AND s3_key IS NULL)::text AS expired,
            count(*) FILTER (WHERE expires_at > NOW() AND s3_key IS NOT NULL)::text AS future
          FROM user_data_requests
          WHERE id >= '019e0000-7c07-7000-8000-000000000000'::uuid
            AND id < '019e0000-7c07-7000-8000-000000000020'::uuid`,
        )
        assert.equal(Number(rows[0]?.expired), 10)
        assert.equal(Number(rows[0]?.future), 10)
      },
      undefined,
      'expireDataRequests',
      {
        afterCapture: async () => {
          await rearmExpiredExports()
        },
      },
    )
  } finally {
    await rearmExpiredExports()
  }

  await resetExportRecoveryFixtures()
  await write(`/* analyzeExplainExportRecovery */ ANALYZE user_data_requests`)
  registerScenarioContract('account-data-export-recovery', {
    // The deleted-user UPDATE has no RETURNING rows; the callback verifies both writes.
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['user_data_requests__default_id_idx', 'user_data_requests__default_pkey'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'user_data_requests', max: 500 },
    ],
    seededRows: { user_data_requests: 20_322, users: 20_000 },
    crossPartition: {
      user_data_requests:
        'Stalled and orphan exports can occur across all retained request ID ranges.',
    },
  })
  try {
    await runAndCapture(
      'account-data-export-recovery',
      async () => {
        const result = await claimRecoverableDataRequests(undefined, 200)
        assert.equal(result.requests.length, 100, 'The active recovery page must claim 100 rows')
        const { rows } = await write<{ count: string }>(`/* assertExplainOrphanExportRecovery */
          SELECT count(*)::text AS count FROM user_data_requests
          WHERE id >= '019e0000-7c04-7000-8000-000000000000'::uuid
            AND id < '019e0000-7c04-7000-8000-000000000100'::uuid
            AND failed_at IS NOT NULL`)
        assert.equal(Number(rows[0]?.count), 100, 'The orphan recovery page must fail 100 rows')
      },
      undefined,
      [
        'claimRecoverableDataRequests:candidates',
        'claimRecoverableDataRequests:deletedUsers',
        'claimRecoverableDataRequests:claim',
      ],
      { afterCapture: resetExportRecoveryFixtures },
    )
  } finally {
    await write(`/* cleanupExplainExportRecovery */ DELETE FROM user_data_requests
      WHERE (id >= '019e0000-7c04-7000-8000-000000000000'::uuid
        AND id < '019e0000-7c04-7000-8000-000000000100'::uuid)
        OR (id >= '019e0000-7c06-7000-8000-000000000000'::uuid
        AND id < '019e0000-7c06-7000-8000-000000000100'::uuid)`)
  }
}

async function seedExpiredExports(): Promise<void> {
  await write(`/* seedExplainExpiredExports */
    INSERT INTO user_data_requests (id, dispatched_at, processing_started_at, completed_at,
      s3_key, expires_at)
    SELECT format('019e0000-7c07-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
      NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day',
      'explain-export-' || n,
      CASE WHEN n < 10 THEN NOW() - INTERVAL '2 days' ELSE NOW() + INTERVAL '1 day' END
    FROM generate_series(0, 19) AS n ON CONFLICT (id) DO NOTHING`)
}

async function resetExportRecoveryFixtures(): Promise<void> {
  await write(`/* resetExplainExportRecovery */ DELETE FROM user_data_requests
    WHERE (id >= '019e0000-7c04-7000-8000-000000000000'::uuid
      AND id < '019e0000-7c04-7000-8000-000000000100'::uuid)
      OR (id >= '019e0000-7c06-7000-8000-000000000000'::uuid
      AND id < '019e0000-7c06-7000-8000-000000000100'::uuid)`)
  await write(`/* resetExplainExportRecovery:orphans */
    INSERT INTO user_data_requests (id, dispatched_at)
    SELECT format('019e0000-7c04-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
      NOW() - INTERVAL '1 day'
    FROM generate_series(0, 99) AS n`)
  await write(`/* resetExplainExportRecovery:active */
    INSERT INTO user_data_requests (id, user_id, dispatched_at)
    SELECT format('019e0000-7c06-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
      format('019e0000-0100-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
      NOW() - INTERVAL '1 day'
    FROM generate_series(0, 99) AS n`)
}
