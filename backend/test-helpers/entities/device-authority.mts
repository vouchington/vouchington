import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function clearTestDeviceAuthority(userId: string, sessionId: string): Promise<void> {
  await write(sql`/* clearTestDeviceAuthority */
    UPDATE user_sessions SET device_token_digest = NULL, previous_device_token_digest = NULL,
      previous_device_token_grace_expires_at = NULL, device_token_encrypted = NULL,
      device_token_issued_at = NULL, device_token_binding = NULL
    WHERE id = ${sessionId} AND user_id = ${userId}`)
}

export async function expireTestPreviousDeviceTokenGrace(
  userId: string,
  sessionId: string,
): Promise<void> {
  await write(sql`/* expireTestPreviousDeviceTokenGrace */
    UPDATE user_sessions SET previous_device_token_grace_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE id = ${sessionId} AND user_id = ${userId}`)
}

export async function setTestDeviceBinding(
  userId: string,
  sessionId: string,
  binding: Record<string, unknown>,
): Promise<void> {
  const encoded = JSON.stringify(binding)
  await write(sql`/* setTestDeviceBinding */
    UPDATE user_sessions SET device_token_binding = ${encoded}::jsonb
    WHERE id = ${sessionId} AND user_id = ${userId}`)
}

export async function shiftTestDeviceAuthorityIssuedAt(
  userId: string,
  sessionId: string,
): Promise<void> {
  await write(sql`/* shiftTestDeviceAuthorityIssuedAt */
    UPDATE user_sessions SET device_token_issued_at = device_token_issued_at - INTERVAL '1 second'
    WHERE id = ${sessionId} AND user_id = ${userId}`)
}
