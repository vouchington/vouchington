import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import sql from 'sql-template-strings'
import { destroyCopyrightOwnerEncryptionKey } from './encryption-key-destruction.mts'

type ReceiptWork = { id: string; final_explanation_erasure_started_at: Date | null }

/** One raw receipt per transaction; blocked owners advance and are revisited on the next pass. */
export async function sweepCopyrightReceiptExplanations(options: { maxBatches: number }): Promise<{
  scanned: number
  retired: number
  hasMore: boolean
}> {
  if (!Number.isInteger(options.maxBatches) || options.maxBatches < 1 || options.maxBatches > 128)
    throw new RangeError('Receipt explanation retirement requires at most 128 bounded ticks')
  const cutoff = shiftUtcCalendarMonths(new Date(), -72)
  // Three days cover UTC month-end clamping; the SQL owner clock decides eligibility.
  const upperId = getMaxUUIDv7ForDate(new Date(cutoff.getTime() + 3 * 86400000))
  let scanned = 0
  let retired = 0
  for (let batch = 0; batch < options.maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded owner tick commits its cursor/fence before the next tick.
    const page = await retireReceiptPage(upperId) // no-mistakes-disable-line query-reached-per-item: validated maxBatches caps one raw owner per committed tick.
    scanned += page.scanned
    retired += page.retired
    if (!page.hasMore) return { scanned, retired, hasMore: false }
  }
  return { scanned, retired, hasMore: true }
}

async function retireReceiptPage(upperId: string) {
  await using query = await beginTransaction()
  const { rows: cursor } = await query<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(sql`
    /* lockCopyrightReceiptExplanationCursor */
    INSERT INTO copyright_notice_operational_retention_cursors(kind)
    VALUES ('receipt_explanations') ON CONFLICT (kind) DO UPDATE SET kind = EXCLUDED.kind
    RETURNING cursor_record_id, sweep_upper_bound_record_id`)
  const work = cursor[0]!
  const upper = work.sweep_upper_bound_record_id ?? upperId
  const { rows } = await query<ReceiptWork>(sql`/* pageCopyrightReceiptExplanationOwners */
    SELECT id, final_explanation_erasure_started_at
    FROM copyright_notice_email_intake_receipts
    WHERE id > COALESCE(${work.cursor_record_id}::uuid, '00000000-0000-7000-8000-000000000000'::uuid)
      AND id <= ${upper}::uuid ORDER BY id LIMIT 1 FOR UPDATE`)
  const receipt = rows[0]
  const outcome = receipt ? await retireReceiptExplanation(query, receipt) : 'ineligible'
  const complete = outcome !== 'started'
  await checkpointReceiptRetirement(query, receipt?.id ?? null, upper, complete)
  await query.commit()
  return {
    scanned: receipt ? 1 : 0,
    retired: outcome === 'retired' ? 1 : 0,
    hasMore: Boolean(receipt),
  }
}

async function retireReceiptExplanation(
  query: TransactionQuery,
  receipt: ReceiptWork,
): Promise<'started' | 'retired' | 'ineligible'> {
  // Recheck in a fresh statement after acquiring the owner lock; the candidate SELECT may
  // have waited behind a preservation mutation with an older statement snapshot.
  const { rows } = await query<{
    eligible: boolean
  }>(sql`/* scopeCopyrightReceiptExplanationRetirement */
    SELECT set_config('app.copyright_receipt_retention_id', ${receipt.id}, true),
      fn_project_copyright_receipt_explanation_eligible(${receipt.id}::uuid) AS eligible`)
  if (!rows[0]?.eligible) return 'ineligible'
  if (!receipt.final_explanation_erasure_started_at) {
    await query(sql`/* fenceCopyrightReceiptExplanationRetirement */
      UPDATE copyright_notice_email_intake_receipts SET final_explanation_erasure_started_at = clock_timestamp()
      WHERE id = ${receipt.id} AND final_explanation_erasure_started_at IS NULL`)
    return 'started'
  }
  await destroyCopyrightOwnerEncryptionKey({ kind: 'receipt', id: receipt.id }, query)
  await finishReceiptRetirement(query, receipt.id)
  return 'retired'
}

async function finishReceiptRetirement(query: TransactionQuery, receiptId: string): Promise<void> {
  await query(sql`/* finishCopyrightReceiptExplanationRetirement */
    UPDATE copyright_notice_email_intake_receipts
    SET review_decision = NULL, reviewed_by_id = NULL, reviewed_at = NULL,
      review_rationale_ciphertext = NULL, last_delivery_activity_at = NULL,
      preservation_hold_kind = NULL, preservation_hold_placed_at = NULL,
      preservation_hold_placed_by_id = NULL, preservation_hold_released_at = NULL,
      preservation_hold_released_by_id = NULL, last_preservation_hold_released_at = NULL,
      final_explanation_erased_at = clock_timestamp()
    WHERE id = ${receiptId} AND final_explanation_erased_at IS NULL`)
}

async function checkpointReceiptRetirement(
  query: TransactionQuery,
  receiptId: string | null,
  upperId: string,
  complete: boolean,
) {
  await query(sql`/* checkpointCopyrightReceiptExplanationRetirement */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = CASE WHEN ${complete} THEN ${receiptId}::uuid ELSE cursor_record_id END,
      sweep_upper_bound_record_id = CASE WHEN ${receiptId}::uuid IS NULL THEN NULL ELSE ${upperId}::uuid END
    WHERE kind = 'receipt_explanations'`)
}
