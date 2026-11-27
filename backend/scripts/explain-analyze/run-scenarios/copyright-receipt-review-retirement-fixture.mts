import assert from 'node:assert/strict'
import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

export function seedReviews(timestamp: number, oldIds: string[], recentIds: string[]) {
  return write(sql`/* seedCopyrightReceiptReviewCapacity */
    INSERT INTO copyright_notice_email_intake_receipts
      (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size,
       erased_at, review_decision, reviewed_at, reviewed_by_id, review_rationale_ciphertext)
    SELECT id, 'explain-retirement-' || id::text, sha256(id::text::bytea), sha256(id::text::bytea), 12,
      reviewed_at, 'rejected', reviewed_at, ${seedUser.id}::uuid, 'v1:fixture'
    FROM (
      SELECT id, ${new Date(timestamp + 86_400_000)}::timestamptz AS reviewed_at FROM unnest(${oldIds}::uuid[]) AS old(id)
      UNION ALL
      SELECT id, CURRENT_TIMESTAMP - interval '1 year' FROM unnest(${recentIds}::uuid[]) AS recent(id)
    ) AS fixture`)
}

export function makeOldCandidates(timestamp: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: seedUuidAtTimestamp(timestamp, index),
    holdId: index % 4 === 3 ? null : seedUuidAtTimestamp(timestamp + 172_800_000, index),
    holdState: index % 4,
  }))
}

export type Candidate = ReturnType<typeof makeOldCandidates>[number]

export function seedHolds(
  candidates: readonly Candidate[],
  recentIds: string[],
  recentTimestamp: number,
  cutoff: Date,
) {
  const holds = candidates.filter(candidate => candidate.holdId !== null)
  return write(sql`/* seedCopyrightReceiptHoldCapacity */
    INSERT INTO copyright_email_receipt_preservation_holds
      (id, copyright_notice_email_intake_receipt_id, kind, placed_by_id, released_at, released_by_id)
    SELECT hold_id, receipt_id, 'court_request', ${seedUser.id}::uuid, released_at,
      CASE WHEN released_at IS NOT NULL THEN ${seedUser.id}::uuid END
    FROM (
      SELECT hold_id, receipt_id, CASE state
        WHEN 0 THEN ${cutoff}::timestamptz
        WHEN 2 THEN CURRENT_TIMESTAMP - interval '1 month'
      END AS released_at
      FROM unnest(${holds.map(hold => hold.holdId)}::uuid[], ${holds.map(hold => hold.id)}::uuid[],
        ${holds.map(hold => hold.holdState)}::int[]) AS old(hold_id, receipt_id, state)
      UNION ALL
      SELECT hold_id, receipt_id, NULL::timestamptz
      FROM unnest(${recentIds.map((_, index) => seedUuidAtTimestamp(recentTimestamp, index))}::uuid[],
        ${recentIds}::uuid[]) AS recent(hold_id, receipt_id)
    ) AS fixture`)
}

export async function inspectOutcome(
  query: TransactionQuery,
  observed: readonly Candidate[],
  retired: readonly Candidate[],
  scanned: readonly Candidate[],
) {
  const retiredIds = new Set(retired.map(candidate => candidate.id))
  const scannedIds = new Set(scanned.map(candidate => candidate.id))
  const observedIds = observed.map(candidate => candidate.id)
  const { rows: reviews } = await query(sql`/* inspectCopyrightReceiptReviewCapacity */
    SELECT id, review_decision AS decision, reviewed_at IS NULL AS "reviewTimeCleared",
      reviewed_by_id AS reviewer, review_rationale_ciphertext AS rationale,
      review_retirement_check_at > CURRENT_TIMESTAMP AS deferred
    FROM copyright_notice_email_intake_receipts WHERE id = ANY(${observedIds}::uuid[]) ORDER BY id`)
  assert.deepEqual(
    reviews,
    observed.map(({ id }) => ({
      id,
      decision: retiredIds.has(id) ? null : 'rejected',
      reviewTimeCleared: retiredIds.has(id),
      reviewer: retiredIds.has(id) ? null : seedUser.id,
      rationale: retiredIds.has(id) ? null : 'v1:fixture',
      deferred: !retiredIds.has(id) && scannedIds.has(id),
    })),
  )
  const { rows: holds } = await query<{ id: string }>(sql`/* inspectCopyrightReceiptHoldCapacity */
    SELECT id FROM copyright_email_receipt_preservation_holds
    WHERE copyright_notice_email_intake_receipt_id = ANY(${observedIds}::uuid[]) ORDER BY id`)
  assert.deepEqual(
    holds.map(hold => hold.id),
    observed.flatMap(candidate =>
      candidate.holdId !== null && !retiredIds.has(candidate.id) ? [candidate.holdId] : [],
    ),
  )
}
