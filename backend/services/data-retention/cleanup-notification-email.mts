import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import {
  listNotificationEmailCandidates,
  type Cursor,
} from './cleanup-notification-email-candidates.mts'
import { deleteNotificationEmailPage } from './cleanup-notification-email-deletions.mts'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { MODERATION_EMAIL_SEND_RETENTION_DAYS } from '@services/communities/moderation-summary-retention'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { getSesBounceRetentionDays } from './config.mts'

export type NotificationEmailCleanupName =
  | 'ses_bounce_events'
  | 'system_pruned_notifications'
  | 'user_deleted_notifications'
  | 'moderation_email_sends'

type Position = { at: string | null; id: string; userId?: string }
export type NotificationEmailCleanupResult = {
  deleted: number
  hasMore: boolean
  continuation: Position | null
}
export type NotificationEmailCleanupOptions = {
  batchSize?: number
  maxBatches: number
  lowerBoundDate?: Date
  now?: Date
  borrowedQuery?: TransactionQuery
}

const RETENTION_DAYS: Record<NotificationEmailCleanupName, number> = {
  ses_bounce_events: 90,
  system_pruned_notifications: 90,
  user_deleted_notifications: 180,
  moderation_email_sends: MODERATION_EMAIL_SEND_RETENTION_DAYS,
}

export async function cleanupSesBounceEvents(options: NotificationEmailCleanupOptions) {
  return cleanupNotificationEmailRows('ses_bounce_events', options)
}
export async function cleanupSystemPrunedNotifications(options: NotificationEmailCleanupOptions) {
  return cleanupNotificationEmailRows('system_pruned_notifications', options)
}
export async function cleanupUserDeletedNotifications(options: NotificationEmailCleanupOptions) {
  return cleanupNotificationEmailRows('user_deleted_notifications', options)
}
export async function cleanupModerationEmailSends(options: NotificationEmailCleanupOptions) {
  return cleanupNotificationEmailRows('moderation_email_sends', options)
}

async function cleanupNotificationEmailRows(
  name: NotificationEmailCleanupName,
  options: NotificationEmailCleanupOptions,
): Promise<NotificationEmailCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, 500, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const retentionDays =
    name === 'ses_bounce_events' ? getSesBounceRetentionDays() : RETENTION_DAYS[name]
  const cutoff = getRetentionCutoffDate(retentionDays, options.now)
  let deleted = 0
  let hasMore = false
  let continuation: Position | null = null
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // oxlint-disable no-await-in-loop -- committed page determines the next persisted position
    // no-mistakes-disable-next-line query-reached-per-item: one transaction per bounded page, capped by maxBatches with a persisted continuation
    const result = await cleanupPage(
      name,
      cutoff,
      batchSize,
      options.lowerBoundDate,
      options.borrowedQuery,
    )
    // oxlint-enable no-await-in-loop
    deleted += result.deleted
    hasMore = result.hasMore
    continuation = result.continuation
    if (!hasMore) break
  }
  return { deleted, hasMore, continuation }
}

async function cleanupPage(
  name: NotificationEmailCleanupName,
  cutoff: Date,
  batchSize: number,
  lowerBoundDate?: Date,
  borrowedQuery?: TransactionQuery,
): Promise<NotificationEmailCleanupResult> {
  if (borrowedQuery)
    return withTransactionOptions({ query: borrowedQuery }, query =>
      cleanupPageInTransaction(query, name, cutoff, batchSize, lowerBoundDate, true),
    )
  await using query = await beginTransaction()
  const result = await cleanupPageInTransaction(
    query,
    name,
    cutoff,
    batchSize,
    lowerBoundDate,
    lowerBoundDate === undefined,
  )
  await query.commit()
  return result
}

async function cleanupPageInTransaction(
  query: TransactionQuery,
  name: NotificationEmailCleanupName,
  cutoff: Date,
  batchSize: number,
  lowerBoundDate: Date | undefined,
  trackCursor: boolean,
): Promise<NotificationEmailCleanupResult> {
  // A bounded test window cannot advance the production sweep past unrelated rows.
  let cursor: Cursor | undefined
  if (trackCursor) {
    await query(
      `/* ensureNotificationEmailRetentionCursor */
       INSERT INTO notification_email_retention_cleanup_cursors (cleanup_name)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [name],
    )
    cursor = (
      await query<Cursor>(
        `/* lockNotificationEmailRetentionCursor */
       SELECT cursor_at::text AS cursor_at, cursor_position, cursor_partition_key, sweep_cutoff_at
       FROM notification_email_retention_cleanup_cursors
       WHERE cleanup_name = $1 FOR UPDATE`,
        [name],
      )
    ).rows[0]
  }
  const sweepCutoff = cursor?.sweep_cutoff_at ?? cutoff
  const candidates = await listNotificationEmailCandidates(
    query,
    name,
    sweepCutoff,
    batchSize + 1,
    cursor,
    lowerBoundDate,
  )
  const page = candidates.slice(0, batchSize)
  const deleted = await deleteNotificationEmailPage(query, name, page, sweepCutoff)
  const hasMore = candidates.length > batchSize
  const last = hasMore ? page.at(-1)! : null
  let continuation: Position | null = null
  if (last) {
    if (name.endsWith('_notifications') && !last.user_id)
      throw new Error('Notification retention candidate lacks user_id')
    continuation = {
      at: last.position_at,
      id: last.id,
      ...(last.user_id ? { userId: last.user_id } : {}),
    }
  }
  if (trackCursor) {
    await query(
      `/* checkpointNotificationEmailRetentionCursor */
       UPDATE notification_email_retention_cleanup_cursors
       SET cursor_at = $2, cursor_position = $3, cursor_partition_key = $4, sweep_cutoff_at = $5
       WHERE cleanup_name = $1`,
      [
        name,
        continuation?.at ?? null,
        continuation?.id ?? null,
        continuation?.userId ?? null,
        hasMore ? sweepCutoff : null,
      ],
    )
  }
  return { deleted, hasMore, continuation }
}
