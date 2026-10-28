import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { cleanupExpiredUserDataRequestAttempts } from '@services/data-retention/cleanup-user-data-request-attempts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { postSeedTimestampMs, seedUuidAtTimestamp } from '../seed-data/common.mts'
import { seedImportRequestRetention } from '../seed-data/import-request-retention.mts'

export async function runImportRequestRetentionScenarios(): Promise<void> {
  const oldRequestTimestamp = postSeedTimestampMs(0) - 40 * 86_400_000
  const requestId = seedUuidAtTimestamp(oldRequestTimestamp, 0)
  registerScenarioContract('import-retention-parent', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_admin_import_batches__completed_at__id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'admin_import_batches', max: 2 },
    ],
    seededRows: { admin_import_batches: 20_001 },
  })
  await runAndCapture('import-retention-parent', () =>
    write(
      `/* selectCompletedImportRetentionBatch */ SELECT id FROM admin_import_batches
       WHERE completed_at IS NOT NULL AND completed_at < $1::timestamptz
         AND completed_at >= $2::timestamptz
       ORDER BY completed_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [new Date(), new Date(0)],
    ),
  )

  registerScenarioContract('import-retention-child-continuation', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_admin_import_rows__batch_id', 'admin_import_rows_pkey'],
        anyOf: true,
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'admin_import_rows', max: 102 },
    ],
    seededRows: { admin_import_rows: 20_000 },
  })
  await runAndCapture('import-retention-child-continuation', () =>
    write(
      `/* selectImportRowRetentionPage */ SELECT id FROM admin_import_rows
       WHERE batch_id = $1::uuid AND id > $2::uuid
       ORDER BY id LIMIT 101 FOR UPDATE`,
      ['019e0000-7a01-7000-8000-000000000000', '019e0000-7a02-7000-8000-000000010000'],
    ),
  )

  registerScenarioContract('request-attempt-retention-continuation', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['user_data_request_attempts__default_pkey'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'user_data_request_attempts', max: 102 },
    ],
    seededRows: { user_data_request_attempts: 20_001 },
  })
  await runAndCapture('request-attempt-retention-continuation', () =>
    write(
      `/* selectUserDataRequestAttemptRetentionPage */
       SELECT request_id, processing_attempt_id FROM user_data_request_attempts
       WHERE request_id < $1::uuid AND request_id >= $2::uuid
         AND (request_id, processing_attempt_id) > ($3::uuid, $4::uuid)
       ORDER BY request_id, processing_attempt_id LIMIT 101 FOR UPDATE`,
      [
        'ffffffff-ffff-7fff-bfff-ffffffffffff',
        '00000000-0000-7000-8000-000000000000',
        requestId,
        '019e0000-7c02-7000-8000-000000010000',
      ],
    ),
  )

  registerScenarioContract('request-attempt-retention-delete', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['user_data_request_attempts__default_pkey'] },
      // DELETE RETURNING counts the 100 indexed inputs and 100 modified target rows.
      { kind: 'maxProcessedRows', relation: 'user_data_request_attempts', max: 202 },
      { kind: 'maxProcessedRows', relation: 'user_data_requests', max: 102 },
    ],
    seededRows: {
      user_data_request_attempts: 20_001,
      user_data_requests: 20_002,
    },
  })
  await runAndCapture(
    'request-attempt-retention-delete',
    async () => {
      const result = await cleanupExpiredUserDataRequestAttempts({
        batchSize: 100,
        maxBatches: 1,
        lowerBoundDate: new Date(oldRequestTimestamp),
      })
      assert.equal(result.deleted, 100, 'The seeded page must contain 100 eligible attempt keys')
    },
    undefined,
    'deleteExpiredUserDataRequestAttemptPage',
    {
      afterCapture: async () => {
        await seedImportRequestRetention()
        await write(`/* resetExplainAttemptRetentionCursor */
          UPDATE user_data_request_attempt_retention_cursors
          SET cursor_request_id = NULL, cursor_processing_attempt_id = NULL,
            cursor_upper_id = NULL
          WHERE cleanup_name = 'expired_attempts'`)
      },
    },
  )

  registerScenarioContract('request-range-retirement-recent', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['user_data_requests__default_coalesce_id_idx'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'user_data_requests', max: 2 },
    ],
    seededRows: { user_data_requests: 20_002 },
  })
  await runAndCapture('request-range-retirement-recent', () =>
    write(
      `/* retireUserDataRequestRange:recent */
       SELECT id FROM user_data_requests__default
       WHERE (completed_at IS NOT NULL OR failed_at IS NOT NULL)
         AND COALESCE(completed_at, failed_at) >= $1::timestamptz
       ORDER BY COALESCE(completed_at, failed_at), id LIMIT 1`,
      [new Date(Date.now() - 30 * 86_400_000)],
    ),
  )
}
