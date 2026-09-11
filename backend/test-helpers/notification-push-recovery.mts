import { read, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

type NotificationPushRecoveryFixture = {
  userId: string
  notificationIds: readonly string[]
  scanBefore: string
  after: { updatedAt: string; userId: string; notificationId: string }
}

type CreatedNotificationPushRecoveryFixture = {
  fixture: NotificationPushRecoveryFixture
  ownedNotificationIds: string[]
}

type NotificationPushRecoveryIntentState = {
  notification_id: string
  status: 'pending' | 'delivered' | 'suppressed'
}

type NotificationPushRecoveryEndpointState = {
  notification_id: string
  subscription_id: string
  endpoint: string
  status: 'pending' | 'delivered' | 'permanently_failed'
}

/** Creates one isolated, fixed recovery page boundary and removes its owned notifications afterward. */
export async function withTestNotificationPushRecoveryBacklog<T>(
  input: { userId: string; count: number },
  run: (fixture: NotificationPushRecoveryFixture) => Promise<T>,
): Promise<T> {
  if (!Number.isSafeInteger(input.count) || input.count < 1)
    throw new TypeError('Notification push recovery fixture count must be positive')

  const { fixture, ownedNotificationIds } = await createTestNotificationPushRecoveryBacklog(input)
  try {
    return await run(fixture)
  } finally {
    await deleteTestNotificationPushRecoveryBacklog(fixture.userId, ownedNotificationIds)
  }
}

export async function getTestNotificationPushRecoveryIntentStates(input: {
  userId: string
  notificationIds: readonly string[]
}): Promise<NotificationPushRecoveryIntentState[]> {
  if (input.notificationIds.length === 0) return []
  const { rows } = await read<NotificationPushRecoveryIntentState>(sql`
    /* getTestNotificationPushRecoveryIntentStates */
    SELECT notification_id, status
    FROM notification_push_intents
    WHERE user_id = ${input.userId}::uuid
      AND notification_id = ANY(${input.notificationIds}::uuid[])
    ORDER BY notification_id
  `)
  return rows
}

export async function getTestNotificationPushRecoveryEndpointStates(input: {
  userId: string
  notificationIds: readonly string[]
}): Promise<NotificationPushRecoveryEndpointState[]> {
  if (input.notificationIds.length === 0) return []
  const { rows } = await read<NotificationPushRecoveryEndpointState>(sql`
    /* getTestNotificationPushRecoveryEndpointStates */
    SELECT receipt.notification_id, receipt.subscription_id, receipt.endpoint, receipt.status
    FROM notification_push_intent_subscription_receipts receipt
    WHERE receipt.user_id = ${input.userId}::uuid
      AND receipt.notification_id = ANY(${input.notificationIds}::uuid[])
    ORDER BY receipt.notification_id, receipt.endpoint, receipt.subscription_id
  `)
  return rows
}

async function createTestNotificationPushRecoveryBacklog(input: {
  userId: string
  count: number
}): Promise<CreatedNotificationPushRecoveryFixture> {
  const ownedNotificationIds = Array.from({ length: input.count }, () => v7()).sort()
  const notificationIds = Object.freeze([...ownedNotificationIds])
  const updatedAt = createTestNotificationPushRecoveryTimestamp(input.userId)
  const afterUpdatedAt = new Date(updatedAt.getTime() - 1)

  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* createTestNotificationPushRecoveryBacklog */
        INSERT INTO notifications (id, user_id, entity_type, delivery_type, title, body, target_path)
        SELECT notification_id, ${input.userId}::uuid, 'referral_click', 'subscription',
          'Recovery page notification', 'Durable push recovery fixture', '/my/referrals'
        FROM UNNEST(${ownedNotificationIds}::uuid[]) AS fixture(notification_id)
      `)
    // Preserve the pinned cursor timestamp by bypassing the managed updated_at trigger for this write.
    await query(sql`SET LOCAL session_replication_role = replica`)
    await query(sql`/* pinTestNotificationPushRecoveryBacklog */
        UPDATE notification_push_intents
        SET updated_at = ${updatedAt}
        WHERE user_id = ${input.userId}::uuid
          AND notification_id = ANY(${ownedNotificationIds}::uuid[])
    `)
    await transaction.commit()
  }

  return {
    ownedNotificationIds,
    fixture: {
      userId: input.userId,
      notificationIds,
      scanBefore: updatedAt.toISOString(),
      after: {
        updatedAt: afterUpdatedAt.toISOString(),
        userId: input.userId,
        notificationId: notificationIds[0]!,
      },
    },
  }
}

function createTestNotificationPushRecoveryTimestamp(userId: string): Date {
  const millisecondsInYear = 31_536_000_000n
  const userBits = BigInt(`0x${userId.replaceAll('-', '')}`)
  return new Date(Date.UTC(2200, 0, 1) + Number(userBits % millisecondsInYear))
}

async function deleteTestNotificationPushRecoveryBacklog(
  userId: string,
  notificationIds: string[],
): Promise<void> {
  await write(sql`/* deleteTestNotificationPushRecoveryBacklog */
    DELETE FROM notifications
    WHERE user_id = ${userId}::uuid
      AND id = ANY(${notificationIds}::uuid[])
  `)
}
