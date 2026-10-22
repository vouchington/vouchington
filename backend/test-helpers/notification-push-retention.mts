import { randomUUID } from 'node:crypto'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Locks and resets the global cursor inside a rollback-only transaction for owned-row tests. */
export async function withTestScopedPendingPushRetention<T>(
  input: { userId: string; notificationIds: readonly string[] },
  run: (query: TransactionQuery) => Promise<T>,
): Promise<{ result: T; remainingIds: string[] }> {
  await using query = await beginTransaction()
  await query(sql`/* ensureTestPendingPushRetentionCursor */
    INSERT INTO notification_push_intent_retention_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  await query(sql`/* lockTestPendingPushRetentionCursor */
    SELECT is_singleton FROM notification_push_intent_retention_cursors
    WHERE is_singleton FOR UPDATE`)
  await query(sql`/* resetTestPendingPushRetentionCursor */
    UPDATE notification_push_intent_retention_cursors
    SET cursor_created_at = NULL, cursor_notification_id = NULL,
      cursor_notification_owner_id = NULL, sweep_upper_bound_created_at = NULL
    WHERE is_singleton`)
  const result = await run(query)
  const { rows } = await query<{ notification_id: string }>(sql`
    /* listTestScopedPendingPushRetention */
    SELECT notification_id FROM notification_push_intents
    WHERE user_id = ${input.userId}::uuid
      AND notification_id = ANY(${input.notificationIds}::uuid[])
    ORDER BY notification_id`)
  return { result, remainingIds: rows.map(row => row.notification_id) }
}

export async function setTestPendingPushIntentRetentionState(
  query: TransactionQuery,
  input: {
    userId: string
    notificationId: string
    createdAt: Date
    leaseExpiresAt?: Date
  },
): Promise<void> {
  const { rowCount } = await query(sql`/* setTestPendingPushIntentRetentionState */
    UPDATE notification_push_intents
    SET created_at = ${input.createdAt}::timestamptz,
      lease_token = ${input.leaseExpiresAt ? randomUUID() : null}::uuid,
      leased_at = ${input.leaseExpiresAt ? input.createdAt : null}::timestamptz,
      lease_expires_at = ${input.leaseExpiresAt ?? null}::timestamptz
    WHERE user_id = ${input.userId}::uuid
      AND notification_id = ${input.notificationId}::uuid`)
  if (rowCount !== 1) throw new Error('Expected owned pending push intent')
}
