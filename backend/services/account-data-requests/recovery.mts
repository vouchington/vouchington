import { getAccountDataRequestsWorkLimit, getDataRequestLimits } from './work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockActiveDataRequestUser } from './active-user-lock.mts'

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
  // Both mutation streams consume one shared, globally ordered candidate page.
  const { rows: candidateRows } = await transaction<{ id: string; user_id: string | null }>(sql`
    /* claimRecoverableDataRequests:candidates */
    WITH orphan_ids AS (
      SELECT id, user_id FROM user_data_requests
      WHERE user_id IS NULL AND completed_at IS NULL AND failed_at IS NULL
        AND (${requestIds ?? null}::uuid[] IS NULL OR id = ANY(${requestIds ?? null}::uuid[]))
      ORDER BY id LIMIT ${batchSize}
    ), active_ids AS (
      SELECT request.id, request.user_id FROM user_data_requests request
      JOIN users active_user ON active_user.id = request.user_id AND active_user.deleted_at IS NULL
      WHERE (${requestIds ?? null}::uuid[] IS NULL OR request.id = ANY(${requestIds ?? null}::uuid[]))
        AND request.completed_at IS NULL AND request.failed_at IS NULL
        AND ((request.processing_started_at IS NULL AND request.dispatched_at < NOW() - ${ACCOUNT_DATA_REQUESTS_DISPATCH_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute')
          OR request.processing_started_at < NOW() - ${ACCOUNT_DATA_REQUESTS_PROCESSING_TIMEOUT_MINUTES}::integer * INTERVAL '1 minute')
      ORDER BY request.id LIMIT ${batchSize}
    )
    SELECT id, user_id FROM (SELECT * FROM orphan_ids UNION ALL SELECT * FROM active_ids) candidates
    ORDER BY id LIMIT ${batchSize}
  `)
  const selectedIds = candidateRows.map(row => row.id)
  const { rowCount: deletedCount } =
    await transaction(sql`/* claimRecoverableDataRequests:deletedUsers */
    WITH candidates AS (
      SELECT id FROM user_data_requests
      WHERE id = ANY(${selectedIds}::uuid[]) AND user_id IS NULL
        AND completed_at IS NULL AND failed_at IS NULL
      ORDER BY id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    )
    UPDATE user_data_requests SET failed_at = CURRENT_TIMESTAMP,
      last_error_message = 'User was deleted before the export completed'
    WHERE id IN (SELECT id FROM candidates)
  `)
  const activeUserIds: string[] = []
  for (const userId of [
    ...new Set(candidateRows.flatMap(row => (row.user_id ? [row.user_id] : []))),
  ].toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- sorted user lifecycle locks fence every candidate before the claim update.
    if (await lockActiveDataRequestUser(transaction, userId)) activeUserIds.push(userId)
  }
  if (activeUserIds.length === 0) {
    await transaction.commit()
    return {
      requests: [],
      hasMore: candidateRows.length === batchSize || candidateRows.length > (deletedCount ?? 0),
    }
  }

  const { rows } = await transaction(sql`/* claimRecoverableDataRequests:claim */
      WITH candidates AS (
        SELECT request.id
      FROM user_data_requests request
      WHERE request.id = ANY(${selectedIds}::uuid[])
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
      candidateRows.length === batchSize ||
      candidateRows.length > (deletedCount ?? 0) + requests.length,
  }
}
