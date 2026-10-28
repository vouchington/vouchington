import { write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
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
  const requestId = getMinUUIDv7ForDate(fixture.createdAt)
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
