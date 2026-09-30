import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * The email-review queue's rule for an intake still waiting for staff, bound to the outer alias
 * `intake`: no intake review, and either no notice link or a thread link whose correspondence was
 * neither admitted nor rejected. The parse row is not part of the rule, so an intake whose parse
 * never landed still waits. The queue page and the review-target sweep both filter with it.
 */
export function copyrightEmailIntakeAwaitingReviewSql(): SQLStatement {
  return sql`
    NOT EXISTS (
      SELECT 1 FROM copyright_notice_email_intake_reviews awaiting_review
      WHERE awaiting_review.copyright_notice_email_intake_id = intake.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM copyright_notice_email_intake_notice_links awaiting_link
      WHERE awaiting_link.copyright_notice_email_intake_id = intake.id
        AND (awaiting_link.link_kind <> 'thread' OR EXISTS (
          SELECT 1 FROM copyright_notice_email_correspondence_reviews awaiting_decision
          WHERE awaiting_decision.copyright_notice_email_intake_id = intake.id
            AND awaiting_decision.action IN ('admitted', 'rejected')
        ))
    )
  `
}
