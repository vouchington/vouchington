import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export type CopyrightReceiptPreservationKind =
  | 'litigation_threat'
  | 'regulator_request'
  | 'court_request'

/**
 * A retained SES receipt owns one current preservation token. Staff may place a hold after the
 * private intake has gone, while the final explanation still exists and can be protected.
 */
export async function placeCopyrightEmailReceiptPreservationHold(
  currentUser: PrivateUser,
  receiptId: string,
  kind: CopyrightReceiptPreservationKind,
): Promise<{ token: string; kind: CopyrightReceiptPreservationKind; placed_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  assert(
    ['litigation_threat', 'regulator_request', 'court_request'].includes(kind),
    422,
    'Invalid preservation reason',
  )
  await using query = await beginTransaction()
  const { rows: receipts } = await query<{
    current_preservation_hold_token: string | null
    review_decision: string | null
    has_final_explanation: boolean
  }>(sql`/* lockCopyrightEmailReceiptPreservation */
    SELECT current_preservation_hold_token, review_decision,
      review_rationale_ciphertext IS NOT NULL AS has_final_explanation
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
    WHERE copyright_notice_email_intake_receipt_id = ${receiptId} LIMIT 1`)
  assert(links.length === 0, 409, 'Linked email receipts use case preservation holds')
  assert(receipt.has_final_explanation, 410, 'Copyright email receipt review has expired')
  assert(
    receipt.current_preservation_hold_token === null,
    409,
    'Copyright email receipt already has a preservation hold',
  )
  const { rows } = await query<{
    token: string
    kind: CopyrightReceiptPreservationKind
    placed_at: Date
  }>(sql`/* placeCopyrightEmailReceiptPreservationHold */
    UPDATE copyright_notice_email_intake_receipts SET
      current_preservation_hold_token = uuidv7(),
      preservation_hold_kind = ${kind},
      preservation_hold_placed_at = CURRENT_TIMESTAMP,
      preservation_hold_placed_by_id = ${currentUser.id},
      preservation_hold_released_at = NULL,
      preservation_hold_released_by_id = NULL
    WHERE id = ${receiptId}
    RETURNING current_preservation_hold_token AS token, preservation_hold_kind AS kind,
      preservation_hold_placed_at AS placed_at`)
  const hold = rows[0]
  assert(hold, 500, 'Copyright email receipt preservation hold was not recorded')
  await query.commit()
  return hold
}

/** An old token cannot release a replacement hold on the same retained receipt. */
export async function releaseCopyrightEmailReceiptPreservationHold(
  currentUser: PrivateUser,
  receiptId: string,
  holdToken: string,
): Promise<{ released_at: Date }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  await using query = await beginTransaction()
  const { rows: receipts } = await query<{ current_preservation_hold_token: string | null }>(
    sql`/* lockCopyrightEmailReceiptPreservationRelease */
      SELECT current_preservation_hold_token FROM copyright_notice_email_intake_receipts
      WHERE id = ${receiptId} FOR UPDATE`,
  )
  const receipt = receipts[0]
  assert(receipt, 404, 'Copyright email receipt not found')
  assert(
    receipt.current_preservation_hold_token === holdToken,
    409,
    'Copyright email receipt preservation token is absent or stale',
  )
  const { rows } = await query<{ released_at: Date }>(
    sql`/* releaseCopyrightEmailReceiptPreservationHold */
      UPDATE copyright_notice_email_intake_receipts SET
        current_preservation_hold_token = NULL,
        preservation_hold_released_at = CURRENT_TIMESTAMP,
        preservation_hold_released_by_id = ${currentUser.id},
        last_preservation_hold_released_at =
          GREATEST(last_preservation_hold_released_at, CURRENT_TIMESTAMP)
      WHERE id = ${receiptId} AND current_preservation_hold_token = ${holdToken}
      RETURNING preservation_hold_released_at AS released_at`,
  )
  const released = rows[0]
  assert(released, 409, 'Copyright email receipt preservation token is absent or stale')
  await query.commit()
  return released
}
