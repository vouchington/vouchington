import { write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runImportRequestRetentionScenarios(): Promise<void> {
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
        '019e0000-7c01-7000-8000-000000000000',
        '019e0000-7c02-7000-8000-000000010000',
      ],
    ),
  )
}
