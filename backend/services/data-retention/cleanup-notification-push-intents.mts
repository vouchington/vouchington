import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'

export type TerminalNotificationPushIntentCleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  lowerBoundDate?: Date
  now?: Date
}

export type TerminalNotificationPushIntentCleanupResult = {
  deleted: number
  hasMore: boolean
}

export type PendingNotificationPushIntentCleanupOptions = {
  batchSize?: number
  maxBatches: number
  now?: Date
  /** A borrowed transaction can scope fixture rows and roll back its cursor mutations. */
  borrowedQuery?: TransactionQuery
  scopeUserId?: string
}

export type PendingNotificationPushIntentCleanupResult = {
  deleted: number
  hasMore: boolean
  continuation: string | null
}

/** An intent can be created long after its notification; its own UUIDv7 id sets its age. */
export async function cleanupOldPendingNotificationPushIntents(
  options: PendingNotificationPushIntentCleanupOptions,
): Promise<PendingNotificationPushIntentCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const cutoff = getMinUUIDv7ForDate(getRetentionCutoffDate(30, options.now))
  if (options.scopeUserId && !options.borrowedQuery) {
    throw new TypeError('A scoped pending intent sweep requires a borrowed transaction')
  }
  let result: PendingNotificationPushIntentCleanupResult = {
    deleted: 0,
    hasMore: false,
    continuation: null,
  }
  // oxlint-disable no-await-in-loop -- the committed cursor determines the next page
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: each committed, runtime-capped page advances one durable cursor; pages cannot run concurrently
    const page = await deleteOldPendingNotificationPushIntentPage(cutoff, batchSize, options)
    result = {
      deleted: result.deleted + page.deleted,
      hasMore: page.hasMore,
      continuation: page.continuation,
    }
    if (!page.hasMore) break
  }
  // oxlint-enable no-await-in-loop
  return result
}

async function deleteOldPendingNotificationPushIntentPage(
  cutoff: string,
  batchSize: number,
  options: PendingNotificationPushIntentCleanupOptions,
) {
  await using ownedQuery = options.borrowedQuery ? undefined : await beginTransaction()
  const query = options.borrowedQuery ?? ownedQuery!
  await query(sql`/* ensurePendingPushRetentionCursor */
    INSERT INTO notification_push_intent_retention_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  const { rows: cursors } = await query<{
    cursor_notification_push_intent_id: string | null
    sweep_upper_bound_notification_push_intent_id: string | null
  }>(sql`/* lockPendingPushRetentionCursor */
    SELECT cursor_notification_push_intent_id,
      sweep_upper_bound_notification_push_intent_id
    FROM notification_push_intent_retention_cursors WHERE is_singleton FOR UPDATE`)
  const cursor = cursors[0]!
  const upperBound = cursor.sweep_upper_bound_notification_push_intent_id ?? cutoff
  const candidatesQuery = sql`
    /* listOldPendingNotificationPushIntents */
    SELECT id FROM notification_push_intents
    WHERE status = 'pending'
      AND id < ${upperBound}::uuid
      AND id > COALESCE(${cursor.cursor_notification_push_intent_id}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid)`
  if (options.scopeUserId) candidatesQuery.append(sql` AND user_id = ${options.scopeUserId}::uuid`)
  candidatesQuery.append(sql`
    ORDER BY id
    LIMIT ${batchSize + 1}
    FOR UPDATE`)
  const { rows } = await query<{ id: string }>(candidatesQuery)
  const page = rows.slice(0, batchSize)
  let deleted = 0
  if (page.length > 0) {
    const deletion = await query(sql`/* deleteOldPendingNotificationPushIntentPage */
      DELETE FROM notification_push_intents intent
      WHERE intent.id = ANY(${page.map(row => row.id)}::uuid[])
        AND intent.status = 'pending'
        AND (intent.lease_token IS NULL OR intent.lease_expires_at <= clock_timestamp())`)
    deleted = deletion.rowCount ?? 0
  }
  const hasMore = rows.length > batchSize
  const last = hasMore ? page.at(-1)! : null
  await query(sql`/* advancePendingPushRetentionCursor */
    UPDATE notification_push_intent_retention_cursors
    SET cursor_notification_push_intent_id = ${last?.id ?? null}::uuid,
        sweep_upper_bound_notification_push_intent_id = ${hasMore ? upperBound : null}::uuid
    WHERE is_singleton`)
  if (ownedQuery) await ownedQuery.commit()
  return {
    deleted,
    hasMore,
    continuation: last?.id ?? null,
  }
}

export async function cleanupTerminalNotificationPushIntents(
  options: TerminalNotificationPushIntentCleanupOptions,
): Promise<TerminalNotificationPushIntentCleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  return runBoundedBatches(options, async batchSize =>
    deleteTerminalNotificationPushIntentBatch(cutoffDate, batchSize, options.lowerBoundDate),
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
