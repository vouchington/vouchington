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

export async function waitForTestDatabaseTimestamp(timestampMs: number): Promise<void> {
  await read(sql`/* waitForTestDatabaseTimestamp */
    SELECT pg_sleep(
      GREATEST(
        EXTRACT(EPOCH FROM to_timestamp(${timestampMs} / 1000.0) - clock_timestamp()),
        0
      )
    )
  `)
}
