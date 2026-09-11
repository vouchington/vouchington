import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  deriveDataRequestStatus,
  type DataRequestStatus,
} from '@voucha/types/entities/account-data-request'

export async function expireUserDataRequestForTest(requestId: string): Promise<void> {
  await write(sql`
    UPDATE user_data_requests
    SET expires_at = NOW() - INTERVAL '1 second'
    WHERE id = ${requestId}
  `)
}

export async function clearUserDataRequestExpiryForTest(requestId: string): Promise<void> {
  await write(sql`
    UPDATE user_data_requests
    SET expires_at = NULL
    WHERE id = ${requestId}
  `)
}

export async function getUserDataRequestStatusAndS3KeyForTest(
  requestId: string,
): Promise<{ status: DataRequestStatus; s3_key: string | null } | null> {
  const { rows } = await read(sql`
    SELECT processing_started_at, completed_at, failed_at, s3_key, expires_at
    FROM user_data_requests
    WHERE id = ${requestId}
  `)
  const row = rows[0] as
    | {
        processing_started_at: Date | null
        completed_at: Date | null
        failed_at: Date | null
        s3_key: string | null
        expires_at: Date | null
      }
    | undefined
  if (!row) return null
  return { status: deriveDataRequestStatus(row), s3_key: row.s3_key }
}

export async function makeUserDataRequestRecoverableForTest(
  requestId: string,
  mode: 'unstarted' | 'stale',
): Promise<void> {
  await write(sql`/* makeUserDataRequestRecoverableForTest */
    UPDATE user_data_requests
    SET dispatched_at = NOW() - INTERVAL '31 minutes',
        processing_started_at = CASE
          WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '31 minutes'
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
  }>(sql`
    SELECT upload_lease_expires_at
    FROM user_data_request_attempts
    WHERE request_id = ${requestId}
  `)
  return rows[0] ?? null
}
