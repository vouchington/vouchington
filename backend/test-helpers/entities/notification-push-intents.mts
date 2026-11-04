import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestNotificationPushIntentLeaseExpiry(
  userId: string,
  notificationId: string,
): Promise<number> {
  const { rows } = await read<{
    lease_expires_at: Date
  }>(sql`/* getTestNotificationPushIntentLeaseExpiry */
    SELECT lease_expires_at
    FROM notification_push_intents
    WHERE user_id = ${userId} AND notification_id = ${notificationId}
  `)
  const leaseExpiry = rows[0]?.lease_expires_at
  if (!leaseExpiry) throw new Error('Expected notification push intent lease expiry')
  return leaseExpiry.getTime()
}

/** Reads the lease token and delivery time of one push intent, to prove nothing finalized it. */
export async function getTestNotificationPushIntentState(
  userId: string,
  notificationId: string,
): Promise<{ lease_token: string | null; delivered_at: Date | null }> {
  const { rows } = await read<{
    lease_token: string | null
    delivered_at: Date | null
  }>(sql`/* getTestNotificationPushIntentState */
    SELECT lease_token, delivered_at
    FROM notification_push_intents
    WHERE user_id = ${userId} AND notification_id = ${notificationId}
  `)
  if (!rows[0]) throw new Error('Expected notification push intent row')
  return rows[0]
}
