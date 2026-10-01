import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { attachDerivedStatus } from './derive-status.mts'
import type { UserDataRequest, UserDataRequestRow } from './types.mts'

// Requests are readable only by the user who made them. An administrator-run export (for example a
// legal-process hold) shares the subject's route but must stay invisible to the account holder, so
// every read is scoped to the caller instead of only to the subject.
export async function getLatestDataRequest(
  userId: string,
  requestedById: string,
): Promise<UserDataRequest | null> {
  const { rows } = await read(sql`/* getLatestDataRequest */
    SELECT
      id,
      user_id,
      requested_by_id,
      queued_at,
      processing_attempt_id,
      dispatched_at,
      processing_attempts,
      processing_started_at,
      completed_at,
      failed_at,
      last_error_message,
      s3_key,
      expires_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at
    FROM user_data_requests
    WHERE user_id = ${userId}
      AND requested_by_id = ${requestedById}
    ORDER BY id DESC
    LIMIT 1
  `)
  const row = rows[0] as UserDataRequestRow | undefined
  return row ? attachDerivedStatus(row) : null
}

export async function getDataRequestById(
  userId: string,
  requestedById: string,
  requestId: string,
): Promise<UserDataRequest | null> {
  // Lag-sensitive: the SSE route re-reads after subscribing to catch a worker
  // completion that may have published before the stream connected.
  const { rows } = await write(sql`/* getDataRequestById */
    SELECT
      id,
      user_id,
      requested_by_id,
      queued_at,
      processing_attempt_id,
      dispatched_at,
      processing_attempts,
      processing_started_at,
      completed_at,
      failed_at,
      last_error_message,
      s3_key,
      expires_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at
    FROM user_data_requests
    WHERE user_id = ${userId}
      AND requested_by_id = ${requestedById}
      AND id = ${requestId}
    LIMIT 1
  `)
  const row = rows[0] as UserDataRequestRow | undefined
  return row ? attachDerivedStatus(row) : null
}

/** Fails closed: a missing request or a deleted requester (NULL) is not made by the subject. */
export async function wasDataRequestMadeBySubject(requestId: string): Promise<boolean> {
  const { rows } = await read(sql`/* wasDataRequestMadeBySubject */
    SELECT requested_by_id = user_id AS made_by_subject
    FROM user_data_requests
    WHERE id = ${requestId}
  `)
  return (rows[0] as { made_by_subject: boolean | null } | undefined)?.made_by_subject === true
}
