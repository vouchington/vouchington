import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Seed only the explicit committed graph that a review-path read will inspect. */
export async function seedCommittedCopyrightEmailReviewGraph({
  intakeId,
  ancestorIntakeIds = [],
  noticeId,
}: {
  intakeId: string
  ancestorIntakeIds?: string[]
  noticeId?: string
}) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCommittedCopyrightEmailReviewGraph:ancestors */
    INSERT INTO copyright_notice_email_message_ancestors (
      reply_message_intake_receipt_id, ancestor_message_intake_receipt_id, reference_kind
    )
    SELECT ${intakeId}::uuid, ancestor.copyright_notice_email_intake_id, reference.reference_kind
    FROM copyright_notice_email_thread_references reference
    JOIN copyright_notice_email_thread_references ancestor
      ON ancestor.token_id = reference.token_id AND ancestor.reference_kind = 'message_id'
    WHERE reference.copyright_notice_email_intake_id = ${intakeId}
      AND reference.reference_kind IN ('in_reply_to', 'references')
      AND ancestor.copyright_notice_email_intake_id = ANY(${ancestorIntakeIds}::uuid[])`)
  if (noticeId) {
    await transaction(sql`/* seedCommittedCopyrightEmailReviewGraph:link */
      INSERT INTO copyright_notice_email_intake_notice_links (
        copyright_notice_email_intake_id, copyright_notice_id, link_kind, correspondence_action
      ) VALUES (${intakeId}, ${noticeId}, 'thread', 'pending')`)
  }
  await transaction.commit()
}
