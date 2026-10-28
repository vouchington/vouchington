import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { DATA_RETENTION_MAX_VALUES } from './config.mts'
import { runPersistedRetentionPages } from './run-persisted-pages.mts'

type Position = { requestId: string; processingAttemptId: string }
type Result = { deleted: number; hasMore: boolean; continuation: Position | null }
type Options = { batchSize?: number; maxBatches: number; now?: Date; lowerBoundDate?: Date }
type Cursor = {
  cursor_request_id: string | null
  cursor_processing_attempt_id: string | null
  cursor_upper_id: string | null
}
const MIN_UUIDV7 = '00000000-0000-7000-8000-000000000000'

/**
 * Export objects expire under the user-exports bucket lifecycle after seven days. A terminal
 * request's possible upload keys become expendable only after its last lease plus that window.
 */
export async function cleanupExpiredUserDataRequestAttempts(options: Options): Promise<Result> {
  const now = options.now ?? new Date()
  const requestCutoff = new Date(now.getTime() - 30 * 86_400_000)
  const objectCutoff = new Date(now.getTime() - 7 * 86_400_000)
  const upperId = getMinUUIDv7ForDate(requestCutoff)
  const lowerId = options.lowerBoundDate ? getMinUUIDv7ForDate(options.lowerBoundDate) : null
  return runPersistedRetentionPages(
    options,
    batchSize => deleteAttemptPage(batchSize, requestCutoff, objectCutoff, upperId, lowerId),
    {
      batchSize: DATA_RETENTION_MAX_VALUES.batch_size,
      maxBatches: DATA_RETENTION_MAX_VALUES.max_batches_per_run,
    },
  )
}

async function deleteAttemptPage(
  batchSize: number,
  requestCutoff: Date,
  objectCutoff: Date,
  upperId: string,
  lowerId: string | null,
): Promise<Result> {
  await using query = await beginTransaction()
  await query(`/* ensureUserDataRequestAttemptRetentionCursor */
    INSERT INTO user_data_request_attempt_retention_cursors (cleanup_name)
    VALUES ('expired_attempts') ON CONFLICT (cleanup_name) DO NOTHING`)
  const { rows: cursorRows } = await query<Cursor>(`/* lockUserDataRequestAttemptRetentionCursor */
    SELECT cursor_request_id, cursor_processing_attempt_id, cursor_upper_id
    FROM user_data_request_attempt_retention_cursors
    WHERE cleanup_name = 'expired_attempts' FOR UPDATE`)
  const cursor = cursorRows[0]!
  const sweepCutoffId = lowerId ? upperId : (cursor.cursor_upper_id ?? upperId)
  const cursorRequestId =
    cursor.cursor_request_id &&
    (!lowerId || cursor.cursor_request_id >= lowerId) &&
    cursor.cursor_request_id < sweepCutoffId
      ? cursor.cursor_request_id
      : null
  const { rows } = await query<{
    request_id: string
    processing_attempt_id: string
  }>(
    `/* selectUserDataRequestAttemptRetentionPage */
    SELECT request_id, processing_attempt_id
    FROM user_data_request_attempts
    WHERE request_id < $1::uuid
      AND request_id >= $2::uuid
      AND (request_id, processing_attempt_id) > ($3::uuid, $4::uuid)
    ORDER BY request_id, processing_attempt_id LIMIT $5 FOR UPDATE`,
    [
      sweepCutoffId,
      lowerId ?? MIN_UUIDV7,
      cursorRequestId ?? MIN_UUIDV7,
      cursorRequestId ? cursor.cursor_processing_attempt_id : MIN_UUIDV7,
      batchSize + 1,
    ],
  )
  // One request per page keeps the DELETE keyed by a scalar request_id in generic plans.
  // The lookahead may contain the next request, so it also drives the continuation flag.
  const requestId = rows[0]?.request_id
  const page = rows.slice(0, batchSize).filter(row => row.request_id === requestId)
  let deleted = 0
  if (page.length > 0) {
    const { rowCount } = await query(
      `/* deleteExpiredUserDataRequestAttemptPage */
      DELETE FROM user_data_request_attempts attempt
      USING user_data_requests request
      WHERE attempt.request_id = $1::uuid
        AND attempt.processing_attempt_id = ANY($2::uuid[])
        AND request.id = attempt.request_id
        AND request.id < $3::uuid
        AND COALESCE(request.completed_at, request.failed_at) < $4::timestamptz
        AND request.s3_key IS NULL
        AND GREATEST(attempt.started_at,
          COALESCE(attempt.upload_lease_expires_at, attempt.started_at)) < $5::timestamptz
      RETURNING attempt.request_id`,
      [
        requestId,
        page.map(row => row.processing_attempt_id),
        sweepCutoffId,
        requestCutoff,
        objectCutoff,
      ],
    )
    deleted = rowCount ?? 0
  }
  const hasMore = rows.length > page.length
  const last = page.at(-1)
  await query(
    `/* updateUserDataRequestAttemptRetentionCursor */
    UPDATE user_data_request_attempt_retention_cursors
    SET cursor_request_id = $1, cursor_processing_attempt_id = $2,
        cursor_upper_id = $3
    WHERE cleanup_name = 'expired_attempts'`,
    [
      hasMore ? last?.request_id : null,
      hasMore ? last?.processing_attempt_id : null,
      hasMore ? sweepCutoffId : null,
    ],
  )
  await query.commit()
  return {
    deleted,
    hasMore,
    continuation:
      hasMore && last
        ? { requestId: last.request_id, processingAttemptId: last.processing_attempt_id }
        : null,
  }
}
