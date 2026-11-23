import { write } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'

type Fixture = {
  createdAt: Date
  terminalAt: Date | null
  attemptStartedAt: Date
  uploadLeaseExpiresAt?: Date | null
  s3Key?: string | null
}

export async function createDataRequestAttemptRetentionFixture(
  userId: string,
  fixture: Fixture,
): Promise<string> {
  const requestId = getMinUuidv7ForDate(fixture.createdAt)
  await write(sql`/* createDataRequestAttemptRetentionFixture:request */
    INSERT INTO user_data_requests
      (id, user_id, requested_by_id, processing_started_at, completed_at, s3_key, expires_at)
    VALUES (${requestId}, ${userId}, ${userId},
      ${fixture.attemptStartedAt},
      ${fixture.terminalAt}, ${fixture.s3Key ?? null},
      ${fixture.terminalAt ? fixture.terminalAt : null})`)
  if (fixture.uploadLeaseExpiresAt) {
    await write(sql`/* createDataRequestAttemptRetentionFixture:lease */
      UPDATE user_data_request_attempts
      SET upload_lease_expires_at = ${fixture.uploadLeaseExpiresAt}
      WHERE request_id = ${requestId}`)
  }
  return requestId
}

export async function countDataRequestAttemptsForRetention(requestId: string): Promise<number> {
  const { rows } = await write<{ count: string }>(sql`/* countDataRequestAttemptsForRetention */
    SELECT count(*) AS count FROM user_data_request_attempts WHERE request_id = ${requestId}`)
  return Number(rows[0]!.count)
}

type AttemptRetentionCursor = {
  cursor_request_id: string | null
  cursor_processing_attempt_id: string | null
  cursor_upper_id: string | null
}

export async function readDataRequestAttemptRetentionCursor(): Promise<AttemptRetentionCursor | null> {
  const { rows } = await write<AttemptRetentionCursor>(sql`
    /* readDataRequestAttemptRetentionCursor */
    SELECT cursor_request_id, cursor_processing_attempt_id, cursor_upper_id
    FROM user_data_request_attempt_retention_cursors WHERE cleanup_name = 'expired_attempts'`)
  return rows[0] ?? null
}

export async function restoreDataRequestAttemptRetentionCursor(
  cursor: AttemptRetentionCursor | null,
): Promise<void> {
  if (!cursor) {
    await write(sql`/* removeDataRequestAttemptRetentionCursor */
      DELETE FROM user_data_request_attempt_retention_cursors WHERE cleanup_name = 'expired_attempts'`)
    return
  }
  await write(sql`/* restoreDataRequestAttemptRetentionCursor */
    UPDATE user_data_request_attempt_retention_cursors
    SET cursor_request_id = ${cursor.cursor_request_id},
        cursor_processing_attempt_id = ${cursor.cursor_processing_attempt_id},
        cursor_upper_id = ${cursor.cursor_upper_id}
    WHERE cleanup_name = 'expired_attempts'`)
}

export async function ensureDataRequestAttemptRetentionCursor(): Promise<void> {
  await write(sql`/* ensureDataRequestAttemptRetentionCursorForTest */
    INSERT INTO user_data_request_attempt_retention_cursors (cleanup_name)
    VALUES ('expired_attempts') ON CONFLICT (cleanup_name) DO NOTHING`)
}
