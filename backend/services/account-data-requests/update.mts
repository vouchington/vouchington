import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockActiveDataRequestUser } from './active-user-lock.mts'

export const DATA_REQUEST_UPLOAD_LEASE_MS = 600_000

export async function markDataRequestProcessing(
  requestId: string,
  processingAttemptId?: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const userId = await getDataRequestUserId(transaction, requestId)
  if (!userId) return false
  const claimed = await claimDataRequestProcessing(
    transaction,
    userId,
    requestId,
    processingAttemptId,
  )
  if (!claimed) return false
  await transaction.commit()
  return true
}

export async function leaseDataRequestUpload(
  requestId: string,
  processingAttemptId: string,
  leaseMs = DATA_REQUEST_UPLOAD_LEASE_MS,
): Promise<Date | null> {
  await using transaction = await beginTransaction()
  const userId = await getDataRequestUserId(transaction, requestId)
  if (!userId || !(await lockActiveDataRequestUser(transaction, userId))) return null
  const { rows } = await transaction<{ upload_lease_expires_at: Date }>(sql`
    UPDATE user_data_request_attempts attempt
    SET upload_lease_expires_at = CURRENT_TIMESTAMP
      + (${leaseMs}::int * INTERVAL '1 millisecond')
    FROM user_data_requests request
    WHERE attempt.request_id = request.id
      AND request.id = ${requestId}
      AND request.processing_attempt_id = ${processingAttemptId}
      AND request.processing_started_at IS NOT NULL
      AND request.completed_at IS NULL
      AND request.failed_at IS NULL
      AND attempt.processing_attempt_id = request.processing_attempt_id
    RETURNING attempt.upload_lease_expires_at
  `)
  const leaseExpiresAt = rows[0]?.upload_lease_expires_at ?? null
  if (!leaseExpiresAt) return null
  await transaction.commit()
  return leaseExpiresAt
}

export async function finishDataRequestUpload(
  requestId: string,
  processingAttemptId: string,
): Promise<void> {
  await write(sql`/* finishDataRequestUpload */
    UPDATE user_data_request_attempts
    SET upload_lease_expires_at = NULL
    WHERE request_id = ${requestId}
      AND processing_attempt_id = ${processingAttemptId}
  `)
}

async function getDataRequestUserId(
  query: Parameters<typeof lockActiveDataRequestUser>[0],
  requestId: string,
): Promise<string | null> {
  const { rows } = await query<{ user_id: string | null }>(sql`/* markDataRequestProcessing:user */
    SELECT user_id FROM user_data_requests WHERE id = ${requestId}
  `)
  return rows[0]?.user_id ?? null
}

async function claimDataRequestProcessing(
  query: Parameters<typeof lockActiveDataRequestUser>[0],
  userId: string,
  requestId: string,
  processingAttemptId: string | undefined,
): Promise<boolean> {
  if (!(await lockActiveDataRequestUser(query, userId))) return false
  await query(sql`/* markDataRequestProcessing:recordAttempt */
    INSERT INTO user_data_request_attempts (
      request_id, processing_attempt_id, upload_lease_expires_at
    )
    SELECT id, processing_attempt_id, NULL
    FROM user_data_requests
    WHERE id = ${requestId}
      AND user_id = ${userId}
      AND processing_started_at IS NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND (${processingAttemptId ?? null}::uuid IS NULL OR processing_attempt_id = ${processingAttemptId ?? null})
    ON CONFLICT (request_id, processing_attempt_id) DO NOTHING
  `)
  const { rowCount } = await query(sql`/* markDataRequestProcessing */
      UPDATE user_data_requests
      SET processing_started_at = CURRENT_TIMESTAMP,
          processing_attempts = processing_attempts + 1,
          last_error_message = NULL,
          s3_key = NULL,
          expires_at = NULL
      WHERE id = ${requestId}
        AND user_id = ${userId}
        AND processing_started_at IS NULL
        AND completed_at IS NULL
        AND failed_at IS NULL
        AND (${processingAttemptId ?? null}::uuid IS NULL OR processing_attempt_id = ${processingAttemptId ?? null})
    `)
  if ((rowCount ?? 0) === 0) return false
  return true
}

export async function markDataRequestReady(
  requestId: string,
  s3Key: string,
  expiresAt: Date,
  processingAttemptId?: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* markDataRequestReady */
    UPDATE user_data_requests
    SET completed_at = CURRENT_TIMESTAMP,
        s3_key = ${s3Key},
        expires_at = ${expiresAt}
    WHERE id = ${requestId}
      AND processing_started_at IS NOT NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND (${processingAttemptId ?? null}::uuid IS NULL OR processing_attempt_id = ${processingAttemptId ?? null})
  `)
  return (rowCount ?? 0) > 0
}

export async function markDataRequestFailed(
  requestId: string,
  processingAttemptId?: string,
  errorMessage = 'Account data export failed',
  terminal = true,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* markDataRequestFailed */
    UPDATE user_data_requests
    SET failed_at = CASE WHEN ${terminal} THEN CURRENT_TIMESTAMP ELSE NULL END,
        processing_started_at = NULL,
        last_error_message = ${errorMessage.slice(0, 2000)}
    WHERE id = ${requestId}
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND (${processingAttemptId ?? null}::uuid IS NULL OR processing_attempt_id = ${processingAttemptId ?? null})
  `)
  return (rowCount ?? 0) > 0
}

/** Marks all expired ready requests and returns the s3_keys to delete. */
export async function expireDataRequests(): Promise<string[]> {
  const { rows } = await write(sql`/* expireDataRequests */
    WITH reclaimable AS (
      SELECT id, s3_key FROM user_data_requests
      WHERE completed_at IS NOT NULL
        AND failed_at IS NULL
        AND s3_key IS NOT NULL
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
    )
    UPDATE user_data_requests
    SET s3_key = NULL
    FROM reclaimable
    WHERE user_data_requests.id = reclaimable.id
    RETURNING reclaimable.s3_key
  `)
  return rows.flatMap(row => {
    const key = (row as { s3_key: string | null }).s3_key
    return key ? [key] : []
  })
}
