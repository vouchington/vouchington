import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DEFAULT_BATCH_SIZE, normalizePositiveInteger } from './cleanup-batches.mts'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'

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
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  let deleted = 0
  let hasMore = false

  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each locked terminal-intent batch determines whether another bounded deletion is required
    const batchDeleted = await deleteTerminalNotificationPushIntentBatch(
      cutoffDate,
      batchSize,
      options.lowerBoundDate,
    )
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }

  return { deleted, hasMore }
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
