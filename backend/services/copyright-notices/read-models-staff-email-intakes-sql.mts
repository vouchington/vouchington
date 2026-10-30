import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * The email-review queue's rule for an intake still waiting for staff, bound to the outer alias
 * `intake`: no intake review, and either no notice link or a thread link whose correspondence was
 * neither admitted nor rejected. The parse row is not part of the rule, so an intake whose parse
 * never landed still waits. The queue page and the review-target sweep both filter with it.
 */
export function copyrightEmailIntakeAwaitingReviewSql(): SQLStatement {
  return sql`
    EXISTS (
      SELECT 1 FROM copyright_notice_email_intake_receipts receipt
      WHERE receipt.id = intake.id AND receipt.review_decision IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM copyright_notice_email_intake_notice_links awaiting_link
      WHERE awaiting_link.copyright_notice_email_intake_receipt_id = intake.id
        AND (awaiting_link.link_kind <> 'thread'
          OR awaiting_link.correspondence_action IN ('admitted', 'rejected'))
    )
  `
}
