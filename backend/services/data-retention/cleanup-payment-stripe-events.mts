import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import {
  lockPaymentCleanupCursor,
  savePaymentCleanupCursor,
} from './cleanup-payment-operations.mts'

/**
 * Scans stripe_events by id so a run reads at most pageSize + 1 rows. Events with unfinished work
 * or a failed outcome are passed over by the persisted cursor instead of re-read every day; a
 * completed pass resets it so work that later finishes is revisited. Events carry no processing
 * state, so no index predicate can describe them. Scoped runs pick exact ids and skip the cursor.
 */
export async function cleanupStripeEventPage(
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  await using query = await beginTransaction()
  const cursorId = recordIds ? null : await lockPaymentCleanupCursor(query, 'stripe_event_ledger')
  const statement = sql`/* selectExpiredStripeEventLedgerPage */
    SELECT event.id FROM stripe_events event WHERE `
  if (recordIds) {
    statement.append(
      sql`event.id = ANY(${[...recordIds]}::uuid[]) AND event.occurred_at < ${fiscalCutoff}`,
    )
  } else {
    // An event is received no earlier than it occurred, so ids below the cutoff are old enough.
    statement.append(
      sql`event.id < ${getMinUUIDv7ForDate(fiscalCutoff)}
        AND (${cursorId}::uuid IS NULL OR event.id > ${cursorId}::uuid)`,
    )
  }
  statement.append(sql`
    ORDER BY event.id
    LIMIT ${pageSize + 1} FOR UPDATE OF event SKIP LOCKED`)
  const { rows } = await query<{ id: string }>(statement)
  const ids = rows.slice(0, pageSize).map(row => row.id)
  const hasMore = !recordIds && rows.length > pageSize
  let deleted = 0
  if (ids.length > 0) {
    await query(
      sql`/* permitExpiredStripeEventDelete */ SET LOCAL app.billing_retention_delete = 'on'`,
    )
    const result = await query(sql`/* deleteExpiredStripeEventLedgerPage */
      DELETE FROM stripe_events event WHERE event.id = ANY(${ids}::uuid[])
        AND date_trunc('year', event.occurred_at AT TIME ZONE 'UTC') + INTERVAL '8 years'
          <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        AND NOT EXISTS (SELECT 1 FROM stripe_event_processing_work_items work
          WHERE work.stripe_event_id = event.id)`)
    deleted = result.rowCount ?? 0
  }
  if (!recordIds)
    await savePaymentCleanupCursor(query, 'stripe_event_ledger', hasMore ? ids.at(-1)! : null)
  await query.commit()
  return { scanned: ids.length, deleted, hasMore }
}
