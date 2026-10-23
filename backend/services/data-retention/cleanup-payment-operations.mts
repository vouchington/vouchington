import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

export type PaymentOperationCleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches?: number
  lowerBoundDate?: Date
  upperBoundDate?: Date
  now?: Date
}

export type PaymentOperationCleanupResult = {
  deleted: number
  hasMore: boolean
  cursorId: string | null
}

/** One bounded UUIDv7 page. A completed pass resets its cursor so later terminal transitions are revisited. */
export async function cleanupTerminalStripeEventWork(
  options: PaymentOperationCleanupOptions,
): Promise<PaymentOperationCleanupResult> {
  return runPaymentCleanupPages(options, cleanupTerminalStripeEventWorkPage)
}

async function cleanupTerminalStripeEventWorkPage(
  options: PaymentOperationCleanupOptions,
): Promise<PaymentOperationCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 30),
    options.now,
  )
  const idCutoff = getMinUUIDv7ForDate(
    options.upperBoundDate && options.upperBoundDate < cutoff ? options.upperBoundDate : cutoff,
  )
  const idLowerBound = options.lowerBoundDate ? getMinUUIDv7ForDate(options.lowerBoundDate) : null
  await using transaction = await beginTransaction()
  const { rows: progress } = await transaction<{ cursor_id: string | null }>(sql`
    /* cleanupTerminalStripeEventWork.lockCursor */
    SELECT cursor_id FROM payment_operational_cleanup_cursors
    WHERE kind = 'stripe_event_work' FOR UPDATE
  `)
  const cursorId = progress[0]?.cursor_id ?? null
  const { rows } = await transaction<{ stripe_event_id: string }>(sql`
    /* cleanupTerminalStripeEventWork.candidates */
    SELECT stripe_event_id FROM stripe_event_processing_work_items
    WHERE stripe_event_id < ${idCutoff}
      AND (${cursorId}::uuid IS NULL OR stripe_event_id > ${cursorId}::uuid)
      AND (${idLowerBound}::uuid IS NULL OR stripe_event_id >= ${idLowerBound}::uuid)
      AND (processed_at IS NOT NULL OR ignored_at IS NOT NULL)
    ORDER BY stripe_event_id LIMIT ${batchSize + 1}
    FOR UPDATE SKIP LOCKED
  `)
  const page = rows.slice(0, batchSize)
  const ids = page.map(row => row.stripe_event_id)
  const { rowCount } =
    ids.length === 0
      ? { rowCount: 0 }
      : await transaction(sql`/* cleanupTerminalStripeEventWork.delete */
      DELETE FROM stripe_event_processing_work_items
      WHERE stripe_event_id = ANY(${ids}::uuid[])
        AND (processed_at < ${cutoff} OR ignored_at < ${cutoff})
    `)
  const hasMore = rows.length > batchSize
  const nextCursorId = hasMore ? ids.at(-1)! : null
  await transaction(sql`/* cleanupTerminalStripeEventWork.checkpoint */
    UPDATE payment_operational_cleanup_cursors SET cursor_id = ${nextCursorId}::uuid
    WHERE kind = 'stripe_event_work'
  `)
  await transaction.commit()
  return { deleted: rowCount ?? 0, hasMore, cursorId: nextCursorId }
}

/** Expired failed or unlaunched intents are disposable only when no verification references them. */
export async function cleanupAbandonedMembershipPurchaseIntents(
  options: PaymentOperationCleanupOptions,
): Promise<PaymentOperationCleanupResult> {
  return runPaymentCleanupPages(options, cleanupAbandonedMembershipPurchaseIntentsPage)
}

async function cleanupAbandonedMembershipPurchaseIntentsPage(
  options: PaymentOperationCleanupOptions,
): Promise<PaymentOperationCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 30),
    options.now,
  )
  const idCutoff = getMinUUIDv7ForDate(
    options.upperBoundDate && options.upperBoundDate < cutoff ? options.upperBoundDate : cutoff,
  )
  const idLowerBound = options.lowerBoundDate ? getMinUUIDv7ForDate(options.lowerBoundDate) : null
  await using transaction = await beginTransaction()
  const { rows: progress } = await transaction<{ cursor_id: string | null }>(sql`
    /* cleanupAbandonedMembershipPurchaseIntents.lockCursor */
    SELECT cursor_id FROM payment_operational_cleanup_cursors
    WHERE kind = 'purchase_intent' FOR UPDATE
  `)
  const cursorId = progress[0]?.cursor_id ?? null
  const { rows } = await transaction<{ id: string }>(sql`
    /* cleanupAbandonedMembershipPurchaseIntents.candidates */
    SELECT intent.id FROM membership_purchase_intents intent
    WHERE intent.id < ${idCutoff}
      AND (${cursorId}::uuid IS NULL OR intent.id > ${cursorId}::uuid)
      AND (${idLowerBound}::uuid IS NULL OR intent.id >= ${idLowerBound}::uuid)
      AND (intent.launched_at IS NULL OR intent.failed_at IS NOT NULL)
    ORDER BY intent.id LIMIT ${batchSize + 1}
    FOR UPDATE OF intent SKIP LOCKED
  `)
  const page = rows.slice(0, batchSize)
  const ids = page.map(row => row.id)
  const { rowCount } =
    ids.length === 0
      ? { rowCount: 0 }
      : await transaction(sql`/* cleanupAbandonedMembershipPurchaseIntents.delete */
      DELETE FROM membership_purchase_intents intent
      WHERE intent.id = ANY(${ids}::uuid[])
        AND intent.expires_at < ${cutoff}
        AND (intent.launched_at IS NULL OR intent.failed_at IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM membership_verifications verification
          WHERE verification.membership_purchase_intent_id = intent.id
        )
    `)
  const hasMore = rows.length > batchSize
  const nextCursorId = hasMore ? ids.at(-1)! : null
  await transaction(sql`/* cleanupAbandonedMembershipPurchaseIntents.checkpoint */
    UPDATE payment_operational_cleanup_cursors SET cursor_id = ${nextCursorId}::uuid
    WHERE kind = 'purchase_intent'
  `)
  await transaction.commit()
  return { deleted: rowCount ?? 0, hasMore, cursorId: nextCursorId }
}

async function runPaymentCleanupPages(
  options: PaymentOperationCleanupOptions,
  cleanupPage: (options: PaymentOperationCleanupOptions) => Promise<PaymentOperationCleanupResult>,
): Promise<PaymentOperationCleanupResult> {
  const maxBatches = assertPositiveInteger(options.maxBatches ?? 1, 'maxBatches')
  let result: PaymentOperationCleanupResult = { deleted: 0, hasMore: false, cursorId: null }
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each committed keyset page determines continuation
    const page = await cleanupPage(options)
    result = {
      deleted: result.deleted + page.deleted,
      hasMore: page.hasMore,
      cursorId: page.cursorId,
    }
    if (!page.hasMore) break
  }
  return result
}
