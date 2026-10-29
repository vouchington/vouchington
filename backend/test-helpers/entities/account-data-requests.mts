import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  attachDerivedStatus,
  type DataRequestStatus,
  type UserDataRequestRow,
} from '@voucha/types/entities/account-data-request'

export async function expireUserDataRequestForTest(requestId: string): Promise<void> {
  await write(
    sql`/* expireUserDataRequestForTest */
    UPDATE user_data_requests
    SET expires_at = NOW() - INTERVAL '1 second'
    WHERE id = ${requestId}
  `,
  )
}

export async function clearUserDataRequestExpiryForTest(requestId: string): Promise<void> {
  await write(
    sql`/* clearUserDataRequestExpiryForTest */
    UPDATE user_data_requests
    SET expires_at = NULL
    WHERE id = ${requestId}
  `,
  )
}

export async function getUserDataRequestStatusAndS3KeyForTest(
  requestId: string,
): Promise<{ status: DataRequestStatus; s3_key: string | null } | null> {
  const { rows } = await read(
    sql`/* getUserDataRequestStatusAndS3KeyForTest */
    SELECT *
    FROM user_data_requests
    WHERE id = ${requestId}
  `,
  )
  const row = rows[0] as UserDataRequestRow | undefined
  if (!row) return null
  return { status: attachDerivedStatus(row).status, s3_key: row.s3_key }
}

export async function makeUserDataRequestRecoverableForTest(
  requestId: string,
  mode: 'unstarted' | 'stale',
  ageMinutes = 31,
): Promise<void> {
  await write(sql`/* makeUserDataRequestRecoverableForTest */
    UPDATE user_data_requests
    SET dispatched_at = NOW() - ${ageMinutes}::integer * INTERVAL '1 minute',
        processing_started_at = CASE
          WHEN ${mode} = 'stale' THEN NOW() - ${ageMinutes}::integer * INTERVAL '1 minute'
          ELSE NULL
        END
    WHERE id = ${requestId}
  `)
}

export async function getTestDataRequestAttemptFence(
  requestId: string,
): Promise<{ upload_lease_expires_at: Date | null } | null> {
  const { rows } = await write<{
    upload_lease_expires_at: Date | null
  }>(
    sql`/* getTestDataRequestAttemptFence */
    SELECT upload_lease_expires_at
    FROM user_data_request_attempts
    WHERE request_id = ${requestId}
  `,
  )
  return rows[0] ?? null
}

/** Simulates the nullable live-owner reference after deletion, without erasing shared fixtures. */
export async function orphanTestDataRequest(requestId: string): Promise<void> {
  await write(
    sql`/* orphanTestDataRequest */ UPDATE user_data_requests SET user_id = NULL WHERE id = ${requestId}`,
  )
}
