import { getAccountDataRequestsWorkLimit, getDataRequestLimits } from './work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockActiveDataRequestUsers } from './active-user-lock.mts'

export type RecoverableDataRequest = {
  requestId: string
  userId: string
  processingAttemptId: string
}

export async function claimRecoverableDataRequests(
  requestIds?: readonly string[],
  batchSize = getDataRequestLimits().batchSize,
): Promise<{
  requests: RecoverableDataRequest[]
  hasMore: boolean
}> {
  const ACCOUNT_DATA_REQUESTS_DISPATCH_TIMEOUT_MINUTES = getAccountDataRequestsWorkLimit(
    'dispatch_timeout_minutes',
  )
  const ACCOUNT_DATA_REQUESTS_PROCESSING_TIMEOUT_MINUTES = getAccountDataRequestsWorkLimit(
    'processing_timeout_minutes',
  )
  await using transaction = await beginTransaction()
  // This is the final work page: failing a deleted-owner request and reclaiming an active
  // request both consume the processing batch. Lifecycle locks fence those actions after selection.
  const { rows: workRows } = await transaction<{ id: string; user_id: string | null }>(sql`
    /* claimRecoverableDataRequests:candidates */
    -- cross-partition: unfinished exports remain recoverable across every retained request range
    -- no-mistakes-disable-next-line postgres-required-predicates: unfinished exports span all retained request ranges
    SELECT id, user_id FROM user_data_requests request
    WHERE request.completed_at IS NULL AND request.failed_at IS NULL
      AND (${requestIds ?? null}::uuid[] IS NULL OR request.id = ANY(${requestIds ?? null}::uuid[]))
      AND (
        request.user_id IS NULL
        OR (request.processing_started_at IS NULL AND request.dispatched_at < NOW() - ${ACCOUNT_DATA_REQUESTS_DISPATCH_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute')
        OR request.processing_started_at < NOW() - ${ACCOUNT_DATA_REQUESTS_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
      )
    ORDER BY request.id
    LIMIT ${batchSize}
  `)
  const requestPageIds = workRows.map(row => row.id)
  // Sorted lifecycle locks fence every candidate before a request-row lock.
  const candidateUserIds = [
    ...new Set(workRows.flatMap(row => (row.user_id ? [row.user_id] : []))),
  ]
  const activeUsers = await lockActiveDataRequestUsers(transaction, candidateUserIds)
  const activeUserIds = candidateUserIds.filter(userId => activeUsers.has(userId))
  const deletedUserIds = candidateUserIds.filter(userId => !activeUsers.has(userId))
  const { rowCount: deletedCount } =
    await transaction(sql`/* claimRecoverableDataRequests:deletedUsers */
    WITH candidates AS (
      SELECT request.id FROM user_data_requests request
      WHERE request.id = ANY(${requestPageIds}::uuid[])
        AND request.completed_at IS NULL AND request.failed_at IS NULL
        AND (
          request.user_id IS NULL
          OR request.user_id = ANY(${deletedUserIds}::uuid[])
        )
      ORDER BY request.id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    )
    UPDATE user_data_requests SET failed_at = CURRENT_TIMESTAMP,
      last_error_message = 'User was deleted before the export completed'
    WHERE id IN (SELECT id FROM candidates)
  `)
  if (activeUserIds.length === 0) {
    await transaction.commit()
    return {
      requests: [],
      hasMore: workRows.length === batchSize || workRows.length > (deletedCount ?? 0),
    }
  }

  const { rows } = await transaction(sql`/* claimRecoverableDataRequests:claim */
      WITH candidates AS (
        SELECT request.id
      FROM user_data_requests request
      WHERE request.id = ANY(${requestPageIds}::uuid[])
        AND request.completed_at IS NULL
        AND request.failed_at IS NULL
        AND request.user_id = ANY(${activeUserIds}::uuid[])
        AND (
          (request.processing_started_at IS NULL AND request.dispatched_at < NOW() - ${ACCOUNT_DATA_REQUESTS_DISPATCH_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute')
          OR request.processing_started_at < NOW() - ${ACCOUNT_DATA_REQUESTS_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
        )
      ORDER BY request.id
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE user_data_requests request
    SET processing_attempt_id = CASE
          WHEN request.processing_started_at < NOW() - ${ACCOUNT_DATA_REQUESTS_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
          THEN uuidv7()
          ELSE request.processing_attempt_id
        END,
        dispatched_at = CURRENT_TIMESTAMP,
        processing_started_at = CASE
          WHEN request.processing_started_at < NOW() - ${ACCOUNT_DATA_REQUESTS_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute'
          THEN NULL
          ELSE request.processing_started_at
        END
    FROM candidates
    WHERE request.id = candidates.id
    RETURNING request.id, request.user_id, request.processing_attempt_id
    `)
  await transaction.commit()
  const requests = rows.map(row => {
    const typed = row as { id: string; user_id: string; processing_attempt_id: string }
    return {
      requestId: typed.id,
      userId: typed.user_id,
      processingAttemptId: typed.processing_attempt_id,
    }
  })
  return {
    requests,
    hasMore:
      workRows.length === batchSize || workRows.length > (deletedCount ?? 0) + requests.length,
  }
}
