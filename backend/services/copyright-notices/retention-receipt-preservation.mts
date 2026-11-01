import { beginTransaction, write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export type CopyrightReceiptPreservationKind =
  | 'litigation_threat'
  | 'regulator_request'
  | 'court_request'

/**
 * A retained SES receipt may carry at most one open hold row. Staff may place a hold after the
 * private intake has gone, while the final explanation still exists and can be protected.
 */
export async function placeCopyrightEmailReceiptPreservationHold(
  currentUser: PrivateUser,
  receiptId: string,
  kind: CopyrightReceiptPreservationKind,
): Promise<{ id: string; kind: CopyrightReceiptPreservationKind; placed_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  assert(
    ['litigation_threat', 'regulator_request', 'court_request'].includes(kind),
    422,
    'Invalid preservation reason',
  )
  await using query = await beginTransaction()
  const { rows: receipts } = await query<{
    review_decision: string | null
    has_final_explanation: boolean
  }>(sql`/* lockCopyrightEmailReceiptPreservation */
    SELECT review_decision, review_rationale_ciphertext IS NOT NULL AS has_final_explanation
    FROM copyright_notice_email_intake_receipts WHERE id = ${receiptId} FOR UPDATE`)
  const receipt = receipts[0]
  assert(receipt, 404, 'Copyright email receipt not found')
  assert(
    receipt.review_decision !== null,
    409,
    'Only a final standalone email receipt can receive this hold',
  )
  // Fresh statement after the owner lock: an association admitted before that lock is visible.
  const { rows: links } = await query(sql`/* requireStandaloneCopyrightReceiptPreservation */
    SELECT 1 FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${receiptId}
    UNION ALL
    SELECT 1 FROM copyright_notice_email_intake_reviews
    WHERE copyright_notice_email_intake_receipt_id = ${receiptId}
      AND id < ${getMinUUIDv7ForDate(new Date(Date.now() + 86_400_000))}
      AND promoted_copyright_notice_id IS NOT NULL
    UNION ALL
    SELECT 1 FROM copyright_notice_correspondence_messages
    WHERE copyright_notice_email_intake_id = ${receiptId}
    LIMIT 1`)
  assert(links.length === 0, 409, 'Linked email receipts use case preservation holds')
  assert(receipt.has_final_explanation, 410, 'Copyright email receipt review has expired')
  const { rows: open } = await query(sql`/* findOpenCopyrightEmailReceiptPreservationHold */
    SELECT 1 FROM copyright_email_receipt_preservation_holds
    WHERE copyright_notice_email_intake_receipt_id = ${receiptId} AND released_at IS NULL`)
  assert(open.length === 0, 409, 'Copyright email receipt already has a preservation hold')
  const { rows } = await query<{
    id: string
    kind: CopyrightReceiptPreservationKind
    placed_at: Date
  }>(sql`/* placeCopyrightEmailReceiptPreservationHold */
    INSERT INTO copyright_email_receipt_preservation_holds
      (copyright_notice_email_intake_receipt_id, kind, placed_by_id)
    VALUES (${receiptId}, ${kind}::copyright_email_receipt_preservation_kinds, ${currentUser.id})
    RETURNING id, kind, created_at AS placed_at`)
  const hold = rows[0]
  assert(hold, 500, 'Copyright email receipt preservation hold was not recorded')
  await query.commit()
  return hold
}

/** A released hold id cannot release a replacement hold on the same retained receipt. */
export async function releaseCopyrightEmailReceiptPreservationHold(
  currentUser: PrivateUser,
  receiptId: string,
  holdId: string,
): Promise<{ released_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  const { rows } = await write<{ released_at: Date }>(
    sql`/* releaseCopyrightEmailReceiptPreservationHold */
      UPDATE copyright_email_receipt_preservation_holds SET
        released_at = CURRENT_TIMESTAMP, released_by_id = ${currentUser.id}
      WHERE id = ${holdId} AND copyright_notice_email_intake_receipt_id = ${receiptId}
        AND released_at IS NULL
      RETURNING released_at`,
  )
  const released = rows[0]
  assert(released, 409, 'Copyright email receipt preservation hold is absent or already released')
  return released
}
