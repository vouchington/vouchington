import { beginBoundedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Each tick locks a raw due page before testing links, delivery and preservation. */
export async function sweepCopyrightReceiptReviews(options: {
  batchSize: number
  maxBatches: number
  now?: Date
}): Promise<{ scanned: number; retired: number; hasMore: boolean }> {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 5_000)
    throw new RangeError('Receipt review page size must be between 1 and 5,000')
  if (!Number.isInteger(options.maxBatches) || options.maxBatches < 1 || options.maxBatches > 2_000)
    throw new RangeError('Receipt review batch cap must be between 1 and 2,000')
  let scanned = 0
  let retired = 0
  let hasMore = false
  const candidateBefore = options.now ?? new Date()
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each raw page commits before the next bounded tick.
    const page = await sweepReceiptReviewPage(options.batchSize, candidateBefore)
    scanned += page.scanned
    retired += page.retired
    hasMore = page.scanned === options.batchSize
    if (!hasMore) break
  }
  return { scanned, retired, hasMore }
}

async function sweepReceiptReviewPage(
  batchSize: number,
  candidateBefore: Date,
): Promise<{ scanned: number; retired: number }> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  const { rows: candidates } = await transaction<{
    id: string
  }>(sql`/* pageCopyrightReceiptReviewRetirement */
    SELECT id FROM copyright_notice_email_intake_receipts
    WHERE review_decision IS NOT NULL
      AND review_retirement_check_after <= ${candidateBefore}
      AND reviewed_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - make_interval(years => 6)) AT TIME ZONE 'UTC'
    ORDER BY review_retirement_check_after, reviewed_at, id
    LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`)
  if (candidates.length === 0) {
    await transaction.commit()
    return { scanned: 0, retired: 0 }
  }
  // A new statement sees mutations committed before the receipt lock. Later FK inserts on the
  // receipt wait for this transaction, so a late link cannot race the final fact clear.
  await transaction(sql`/* enableCopyrightReceiptReviewRetirement */
    SELECT set_config('app.copyright_receipt_review_retirement', 'on', true)`)
  const ids = candidates.map(candidate => candidate.id)
  const { rows } = await transaction<{
    retired: boolean
  }>(sql`/* retireCopyrightReceiptReviewPage */
    WITH eligible AS MATERIALIZED (
      SELECT receipt.id, fn_copyright_receipt_review_retirement_eligible(receipt.id) AS may_retire
      FROM copyright_notice_email_intake_receipts receipt
      WHERE receipt.id = ANY(${ids}::uuid[])
    )
    UPDATE copyright_notice_email_intake_receipts receipt
    SET review_decision = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.review_decision END,
      reviewed_at = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.reviewed_at END,
      reviewed_by_id = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.reviewed_by_id END,
      review_rationale_ciphertext = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.review_rationale_ciphertext END,
      review_retirement_check_after = CASE WHEN eligible.may_retire THEN '-infinity'::timestamptz
        ELSE CURRENT_TIMESTAMP + interval '1 day' END,
      preservation_hold_kind = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.preservation_hold_kind END,
      preservation_hold_placed_at = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.preservation_hold_placed_at END,
      preservation_hold_placed_by_id = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.preservation_hold_placed_by_id END,
      preservation_hold_released_at = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.preservation_hold_released_at END,
      preservation_hold_released_by_id = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.preservation_hold_released_by_id END,
      last_preservation_hold_released_at = CASE WHEN eligible.may_retire THEN NULL ELSE receipt.last_preservation_hold_released_at END
    FROM eligible WHERE receipt.id = eligible.id
    RETURNING eligible.may_retire AS retired`)
  await transaction.commit()
  return { scanned: candidates.length, retired: rows.filter(row => row.retired).length }
}
