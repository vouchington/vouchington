import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { attachDerivedStatus } from './derive-status.mts'
import type { UserDataRequest, UserDataRequestRow } from './types.mts'

export async function getLatestDataRequest(userId: string): Promise<UserDataRequest | null> {
  const { rows } = await read(sql`/* getLatestDataRequest */
    SELECT
      id,
      user_id,
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
    ORDER BY id DESC
    LIMIT 1
  `)
  const row = rows[0] as UserDataRequestRow | undefined
  return row ? attachDerivedStatus(row) : null
}

export async function getDataRequestById(
  userId: string,
  requestId: string,
): Promise<UserDataRequest | null> {
  // Lag-sensitive: the SSE route re-reads after subscribing to catch a worker
  // completion that may have published before the stream connected.
  const { rows } = await write(sql`/* getDataRequestById */
    SELECT
      id,
      user_id,
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
      AND id = ${requestId}
    LIMIT 1
  `)
  const row = rows[0] as UserDataRequestRow | undefined
  return row ? attachDerivedStatus(row) : null
}
