import { write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { DistributionRow } from './process-types.mts'
import { ensureNotificationPushIntents } from '@services/notifications'

export async function getDistributionForUpdate(
  distributionId: string,
  query: TransactionQuery,
): Promise<DistributionRow | null> {
  const { rows } = await query(sql`/* getDistributionForUpdate */
    SELECT
      follower_distributions.*,
      users.username AS sender_username
    FROM follower_distributions
    JOIN users ON users.id = follower_distributions.sender_user_id
    WHERE follower_distributions.id = ${distributionId}
    FOR UPDATE OF follower_distributions
  `)
  return (rows[0] as DistributionRow | undefined) ?? null
}

export async function getNextRecipientBatch(
  distribution: DistributionRow,
  chunkSize: number,
  query: TransactionQuery,
): Promise<string[]> {
  if (distribution.audience === 'selected_followers') {
    const selected = distribution.selected_recipient_user_ids ?? []
    const { rows } = await query(sql`/* getNextRecipientBatch:selected */
      SELECT users.id
      FROM unnest(${selected}::uuid[]) AS selected_recipients(id)
      JOIN users ON users.id = selected_recipients.id
      WHERE users.deleted_at IS NULL
        AND (
          ${distribution.last_processed_recipient_user_id}::uuid IS NULL
          OR users.id > ${distribution.last_processed_recipient_user_id}
        )
      ORDER BY users.id
      LIMIT ${chunkSize}
    `)
    return rows.map(row => row.id as string)
  }

  const { rows } = await query(sql`/* getNextRecipientBatch */
    SELECT subject_id AS user_id
    FROM relation__user__follow__user
    WHERE object_id = ${distribution.sender_user_id}
      AND created_at <= ${distribution.created_at}
      AND (
        deleted_at IS NULL
        OR deleted_at > ${distribution.created_at}
      )
      AND (
        ${distribution.last_processed_recipient_user_id}::uuid IS NULL
        OR subject_id > ${distribution.last_processed_recipient_user_id}
      )
    ORDER BY subject_id
    LIMIT ${chunkSize}
  `)
  return rows.map(row => row.user_id as string)
}

export async function ensureDeliveryRows(
  distributionId: string,
  recipientIds: string[],
  query: TransactionQuery,
) {
  await query(sql`/* ensureDeliveryRows */
    INSERT INTO follower_distribution_deliveries (
      distribution_id,
      recipient_user_id
    )
    SELECT ${distributionId}, recipients.user_id
    FROM unnest(${recipientIds}::uuid[]) AS recipients(user_id)
    ORDER BY recipients.user_id
    ON CONFLICT (distribution_id, recipient_user_id) DO NOTHING
  `)
}

export async function getUnpushedNotificationsForDeliveries(
  distributionId: string,
  recipientIds: string[],
  query: TransactionQuery,
) {
  const { rows } = await query(sql`/* getUnpushedNotificationsForDeliveries */
    SELECT notifications.user_id, notifications.id
    FROM follower_distribution_deliveries deliveries
    JOIN notifications
      ON notifications.user_id = deliveries.recipient_user_id
     AND notifications.id = deliveries.delivery_id
    WHERE deliveries.distribution_id = ${distributionId}
      AND deliveries.recipient_user_id = ANY(${recipientIds}::uuid[])
      AND notifications.deleted_at IS NULL
      AND notifications.pushed_at IS NULL
  `)
  const notifications = rows.map(row => ({
    userId: row.user_id as string,
    notificationId: row.id as string,
  }))
  await ensureNotificationPushIntents(notifications, { query })
  return notifications
}

export async function updateDistributionCursor(
  distributionId: string,
  recipientId: string,
  query: TransactionQuery,
) {
  await query(sql`/* updateDistributionCursor */
    UPDATE follower_distributions
    SET last_processed_recipient_user_id = ${recipientId}
    WHERE id = ${distributionId}
  `)
}

export async function markDistributionCompleted(distributionId: string, query: TransactionQuery) {
  await query(sql`/* markDistributionCompleted */
    UPDATE follower_distributions
    SET completed_at = CURRENT_TIMESTAMP
    WHERE id = ${distributionId}
      AND completed_at IS NULL
      AND failed_at IS NULL
  `)
}

export async function markDistributionFailed(
  distributionId: string,
  reason: string,
  query: TransactionQuery,
) {
  await query(sql`/* markDistributionFailed */
    UPDATE follower_distributions
    SET failed_at = CURRENT_TIMESTAMP,
        failure_reason = ${reason}
    WHERE id = ${distributionId}
      AND completed_at IS NULL
      AND failed_at IS NULL
	  `)
}

export async function markFollowerDistributionFailed(
  distributionId: string,
  reason: string,
): Promise<void> {
  await write(sql`/* markFollowerDistributionFailed */
    UPDATE follower_distributions
    SET failed_at = CURRENT_TIMESTAMP,
      failure_reason = ${reason}
    WHERE id = ${distributionId}
      AND completed_at IS NULL
      AND failed_at IS NULL
  `)
}
