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
  const ownedNotificationIds = Array.from({ length: input.count }, () => v7()).toSorted()
  const notificationIds = Object.freeze([...ownedNotificationIds])
  await using transaction = await beginTransaction()
  await transaction(sql`/* createTestNotificationPushRecoveryBacklog */
        INSERT INTO notifications (id, user_id, entity_type, delivery_type, title, body, target_path)
        SELECT notification_id, ${input.userId}::uuid, 'referral_click', 'subscription',
          'Recovery page notification', 'Durable push recovery fixture', '/my/referrals'
        FROM UNNEST(${ownedNotificationIds}::uuid[]) AS fixture(notification_id)
      `)
  // Capture the transaction's common timestamp as text: JavaScript Date would lose microseconds.
  const { rows } = await transaction<{
    scan_before: string | null
    after_updated_at: string | null
    notification_count: number
    timestamp_count: number
  }>(sql`/* readTestNotificationPushRecoverySnapshot */
    SELECT min(updated_at)::text AS scan_before,
      (min(updated_at) - interval '1 microsecond')::text AS after_updated_at,
      count(*)::integer AS notification_count,
      count(DISTINCT updated_at)::integer AS timestamp_count
    FROM notification_push_intents
    WHERE user_id = ${input.userId}::uuid
      AND notification_id = ANY(${ownedNotificationIds}::uuid[])
  `)
  const snapshot = rows[0]
  if (
    !snapshot?.scan_before ||
    !snapshot.after_updated_at ||
    snapshot.notification_count !== input.count ||
    snapshot.timestamp_count !== 1
  ) {
    throw new Error('Notification push recovery fixture requires one complete transaction snapshot')
  }
  await transaction.commit()

  return {
    ownedNotificationIds,
    fixture: {
      userId: input.userId,
      notificationIds,
      scanBefore: snapshot.scan_before,
      after: {
        updatedAt: snapshot.after_updated_at,
        userId: input.userId,
        notificationId: notificationIds[0]!,
      },
    },
  }
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
