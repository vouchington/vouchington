import { read } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

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
