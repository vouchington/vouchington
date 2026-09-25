import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'

export type TerminalNotificationPushIntentCleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches?: number
  lowerBoundDate?: Date
  now?: Date
}

export type TerminalNotificationPushIntentCleanupResult = {
  deleted: number
  hasMore: boolean
}

export async function cleanupTerminalNotificationPushIntents(
  options: TerminalNotificationPushIntentCleanupOptions = {},
): Promise<TerminalNotificationPushIntentCleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  return await runBoundedBatches(
    options,
    async batchSize =>
      await deleteTerminalNotificationPushIntentBatch(
        cutoffDate,
        batchSize,
        options.lowerBoundDate,
      ),
  )
}

async function deleteTerminalNotificationPushIntentBatch(
  cutoffDate: Date,
  batchSize: number,
  lowerBoundDate?: Date,
): Promise<number> {
  const query = sql`/* deleteTerminalNotificationPushIntentBatch */
    DELETE FROM notification_push_intents
    WHERE (user_id, notification_id) IN (
      SELECT user_id, notification_id
      FROM notification_push_intents
      WHERE status IN ('delivered', 'suppressed')
        AND COALESCE(delivered_at, suppressed_at) < ${cutoffDate}
  `
  if (lowerBoundDate !== undefined) {
    query.append(sql` AND COALESCE(delivered_at, suppressed_at) >= ${lowerBoundDate}`)
  }
  query.append(sql`
      ORDER BY COALESCE(delivered_at, suppressed_at) ASC, user_id ASC, notification_id ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )`)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}
