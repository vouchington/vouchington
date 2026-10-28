import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

/** Large enough to make the new retention access paths observable in both plan modes. */
export async function seedImportRequestRetention(): Promise<void> {
  const adminBatchId = '019e0000-7a01-7000-8000-000000000000'
  const requestId = seedUuidAtTimestamp(postSeedTimestampMs(0) - 40 * 86_400_000, 0)
  await write(
    `/* seedImportRequestRetention:adminBatches */
     INSERT INTO admin_import_batches (id, import_type, created_by_id, total_rows, failed_rows, completed_at)
     SELECT format('019e0000-7a00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       'topic', $1::uuid, 1, 1, NOW() - INTERVAL '100 days'
     FROM generate_series(0, 19999) AS n ON CONFLICT DO NOTHING`,
    [seedUuid(0, '01')],
  )
  await write(
    `/* seedImportRequestRetention:adminBatch */
     INSERT INTO admin_import_batches (id, import_type, created_by_id, total_rows)
     VALUES ($1::uuid, 'topic', $2::uuid, 20000) ON CONFLICT DO NOTHING`,
    [adminBatchId, seedUuid(0, '01')],
  )
  await write(
    `/* seedImportRequestRetention:adminRows */
     INSERT INTO admin_import_rows (id, batch_id, row_index, input_data, failed_at, error_message)
     SELECT format('019e0000-7a02-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid, n, '{}'::jsonb, NOW() - INTERVAL '100 days', 'invalid input'
     FROM generate_series(0, 19999) AS n
     WHERE EXISTS (SELECT 1 FROM admin_import_batches
       WHERE id = $1::uuid AND completed_at IS NULL)
     ON CONFLICT DO NOTHING`,
    [adminBatchId],
  )
  await write(
    `/* seedImportRequestRetention:complete */
     UPDATE admin_import_batches SET failed_rows = 20000, completed_at = NOW() - INTERVAL '100 days'
     WHERE id = $1::uuid AND completed_at IS NULL`,
    [adminBatchId],
  )
  await write(
    `/* seedImportRequestRetention:request */
     INSERT INTO user_data_requests (id, processing_started_at, completed_at)
     VALUES ($1::uuid, NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days')
     ON CONFLICT DO NOTHING`,
    [requestId],
  )
  await write(
    `/* seedImportRequestRetention:oldRequests */
     INSERT INTO user_data_requests (id, failed_at)
     SELECT format('019e0000-7c00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       NOW() - INTERVAL '40 days'
     FROM generate_series(0, 19999) AS n ON CONFLICT DO NOTHING`,
  )
  await write(
    `/* seedImportRequestRetention:recentRequest */
     INSERT INTO user_data_requests (id, processing_started_at, completed_at)
     VALUES ('019e0000-7c03-7000-8000-000000000000', NOW(), NOW())
     ON CONFLICT DO NOTHING`,
  )
  await write(
    `/* seedImportRequestRetention:attempts */
     INSERT INTO user_data_request_attempts (request_id, processing_attempt_id, started_at)
     SELECT $1::uuid, format('019e0000-7c02-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       NOW() - INTERVAL '40 days'
     FROM generate_series(0, 19999) AS n ON CONFLICT DO NOTHING`,
    [requestId],
  )
  await write(`/* seedImportRequestRetention:analyze */ ANALYZE admin_import_batches`)
  await write(`/* seedImportRequestRetention:analyze */ ANALYZE admin_import_rows`)
  await write(`/* seedImportRequestRetention:analyze */ ANALYZE user_data_request_attempts`)
  await write(`/* seedImportRequestRetention:analyze */ ANALYZE user_data_requests`)
}
