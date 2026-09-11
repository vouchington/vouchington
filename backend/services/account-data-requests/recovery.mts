import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockActiveDataRequestUser } from './active-user-lock.mts'

export type RecoverableDataRequest = {
  requestId: string
  userId: string
  processingAttemptId: string
}

export async function claimRecoverableDataRequests(): Promise<RecoverableDataRequest[]> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* claimRecoverableDataRequests:deletedUsers */
      UPDATE user_data_requests
      SET failed_at = CURRENT_TIMESTAMP,
          last_error_message = 'User was deleted before the export completed'
      WHERE user_id IS NULL AND completed_at IS NULL AND failed_at IS NULL
    `)
  const { rows: candidateRows } = await transaction<{ user_id: string }>(
    sql`/* claimRecoverableDataRequests:candidateUsers */
        SELECT DISTINCT request.user_id
        FROM user_data_requests request
        WHERE request.completed_at IS NULL
          AND request.failed_at IS NULL
          AND request.user_id IS NOT NULL
          AND (
            (request.processing_started_at IS NULL AND request.dispatched_at < NOW() - INTERVAL '5 minutes')
            OR request.processing_started_at < NOW() - INTERVAL '30 minutes'
          )
        ORDER BY request.user_id
        LIMIT 500
      `,
  )
  const activeUserIds: string[] = []
  for (const { user_id: userId } of candidateRows) {
    // oxlint-disable-next-line no-await-in-loop -- sorted user lifecycle locks fence every candidate before the claim update.
    if (await lockActiveDataRequestUser(transaction, userId)) activeUserIds.push(userId)
  }
  if (activeUserIds.length === 0) {
    await transaction.commit()
    return []
  }

  const { rows } = await transaction(sql`/* claimRecoverableDataRequests:claim */
      WITH candidates AS (
        SELECT request.id
      FROM user_data_requests request
      WHERE request.completed_at IS NULL
        AND request.failed_at IS NULL
        AND request.user_id = ANY(${activeUserIds}::uuid[])
        AND (
          (request.processing_started_at IS NULL AND request.dispatched_at < NOW() - INTERVAL '5 minutes')
          OR request.processing_started_at < NOW() - INTERVAL '30 minutes'
        )
      ORDER BY request.id
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE user_data_requests request
    SET processing_attempt_id = CASE
          WHEN request.processing_started_at < NOW() - INTERVAL '30 minutes'
          THEN uuidv7()
          ELSE request.processing_attempt_id
        END,
        dispatched_at = CURRENT_TIMESTAMP,
        processing_started_at = CASE
          WHEN request.processing_started_at < NOW() - INTERVAL '30 minutes'
          THEN NULL
          ELSE request.processing_started_at
        END
    FROM candidates
    WHERE request.id = candidates.id
    RETURNING request.id, request.user_id, request.processing_attempt_id
    `)
  await transaction.commit()
  return rows.map(row => {
    const typed = row as { id: string; user_id: string; processing_attempt_id: string }
    return {
      requestId: typed.id,
      userId: typed.user_id,
      processingAttemptId: typed.processing_attempt_id,
    }
  })
}
