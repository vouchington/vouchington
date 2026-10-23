import { randomInt, randomUUID } from 'node:crypto'
import { write, type TransactionQuery } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { v7 } from 'uuid'

export async function insertTestRetentionToken(
  query: TransactionQuery,
  family: 'email_address_login_tokens' | 'phone_number_login_tokens',
  at: Date,
): Promise<string> {
  const id = v7({ msecs: at.getTime() })
  const address =
    family === 'email_address_login_tokens'
      ? `tests+${randomUUID()}@voucha.ai`
      : `+1555${randomInt(1000000, 9999999)}`
  const valueColumn = family === 'email_address_login_tokens' ? 'email_address' : 'phone_number'
  await query(
    `/* insertTestRetentionToken */
     INSERT INTO ${family} (id, ${valueColumn}, token)
     VALUES ($1, $2, $3)`,
    [id, address, randomUUID().toUpperCase()],
  )
  return id
}

export async function insertTestConsumedEmailTokenAt(email: string, at: Date): Promise<string> {
  const id = v7({ msecs: at.getTime() })
  await write(
    `/* insertTestConsumedEmailTokenAt */
     INSERT INTO email_address_login_tokens (id, email_address, token, logged_in_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [id, email, randomUUID().toUpperCase()],
  )
  return id
}

export async function deleteTestConsumedEmailToken(id: string): Promise<void> {
  await write(
    '/* deleteTestConsumedEmailToken */ DELETE FROM email_address_login_tokens WHERE id = $1',
    [id],
  )
}

export async function insertTestRetentionSession(
  query: TransactionQuery,
  userId: string,
  expiresAt: Date,
  revokedAt: Date | null = null,
): Promise<string> {
  const id = v7()
  const agentId = await upsertUserAgentString('retention-test', { query })
  await query(
    `/* insertTestRetentionSession */
     INSERT INTO user_sessions (id, user_id, device_id, user_agent_string_id, expires_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, randomUUID(), agentId, expiresAt, revokedAt],
  )
  return id
}

export async function insertTestRetentionTombstone(
  query: TransactionQuery,
  userId: string,
  deletedAt: Date,
  id = v7(),
): Promise<string> {
  await query(
    `/* insertTestRetentionTombstone */
     INSERT INTO web_push_subscriptions (user_id, id, endpoint, p256dh, auth, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, id, `https://example.com/${randomUUID()}`, 'c'.repeat(32), 'd'.repeat(16), deletedAt],
  )
  return id
}

export async function insertTestRetentionReceipt(
  query: TransactionQuery,
  userId: string,
  notificationId: string,
  subscriptionId: string,
): Promise<void> {
  await query(
    `/* insertTestRetentionPushIntent */
     INSERT INTO notification_push_intents (user_id, notification_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, notificationId],
  )
  await query(
    `/* insertTestRetentionReceipt */
     INSERT INTO notification_push_intent_subscription_receipts
       (user_id, notification_id, subscription_id, endpoint)
     VALUES ($1, $2, $3, $4)`,
    [userId, notificationId, subscriptionId, `https://example.com/${randomUUID()}`],
  )
}

export async function getTestRetentionCursor(
  query: TransactionQuery,
  family: string,
): Promise<{
  cursor_id: string | null
  cursor_at: Date | null
  cursor_partition_key: string | null
  sweep_cutoff_at: Date | null
}> {
  const { rows } = await query<{
    cursor_id: string | null
    cursor_at: Date | null
    cursor_partition_key: string | null
    sweep_cutoff_at: Date | null
  }>(
    `/* getTestRetentionCursor */
     SELECT cursor_id, cursor_at, cursor_partition_key, sweep_cutoff_at
     FROM auth_session_retention_cleanup_cursors WHERE cleanup_name = $1`,
    [family],
  )
  return rows[0]!
}

export async function resetTestRetentionCursor(
  query: TransactionQuery,
  family: string,
): Promise<void> {
  await query(
    `/* resetTestRetentionCursor */
     INSERT INTO auth_session_retention_cleanup_cursors (cleanup_name)
     VALUES ($1)
     ON CONFLICT (cleanup_name) DO UPDATE
     SET cursor_at = NULL, cursor_id = NULL, cursor_partition_key = NULL, sweep_cutoff_at = NULL`,
    [family],
  )
}

export async function testRetentionRowExists(
  query: TransactionQuery,
  family: 'email_address_login_tokens' | 'phone_number_login_tokens' | 'user_sessions',
  id: string,
): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `/* testRetentionRowExists */ SELECT EXISTS (SELECT 1 FROM ${family} WHERE id = $1) AS exists`,
    [id],
  )
  return rows[0]!.exists
}

export async function testRetentionTombstoneExists(
  query: TransactionQuery,
  userId: string,
  id: string,
): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `/* testRetentionTombstoneExists */
     SELECT EXISTS (SELECT 1 FROM web_push_subscriptions WHERE user_id = $1 AND id = $2) AS exists`,
    [userId, id],
  )
  return rows[0]!.exists
}

export async function setTestRetentionTombstoneMicroseconds(
  query: TransactionQuery,
  userId: string,
  id: string,
  deletedAt: string,
): Promise<void> {
  await query(
    `/* setTestRetentionTombstoneMicroseconds */
     UPDATE web_push_subscriptions SET deleted_at = $3::timestamptz
     WHERE user_id = $1 AND id = $2`,
    [userId, id, deletedAt],
  )
}
