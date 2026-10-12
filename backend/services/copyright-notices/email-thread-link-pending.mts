import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Links replies that arrived before the root message was admitted, including reply chains. */
export async function linkPendingCopyrightEmailRepliesInTransaction(
  input: { initialIntakeId: string; noticeId: string },
  transaction: TransactionQuery,
): Promise<void> {
  await transaction(sql`/* linkPendingCopyrightEmailRepliesInTransaction:links */
    WITH RECURSIVE thread_intakes(intake_id) AS (
      SELECT ${input.initialIntakeId}::uuid
      UNION
      SELECT reply.reply_message_intake_id
      FROM thread_intakes parent
      JOIN copyright_notice_email_message_parents reply
        ON reply.parent_message_intake_id = parent.intake_id
    )
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind
    )
    SELECT intake_id, ${input.noticeId}, 'thread'
    FROM thread_intakes
    WHERE intake_id <> ${input.initialIntakeId}
    ORDER BY intake_id
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
  `)
  await transaction(sql`/* linkPendingCopyrightEmailRepliesInTransaction:reviews */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action
    )
    SELECT link.copyright_notice_email_intake_id, link.copyright_notice_id, 'pending'
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_id = ${input.noticeId} AND link.link_kind = 'thread'
    ORDER BY link.copyright_notice_email_intake_id
    ON CONFLICT (copyright_notice_email_intake_id, action) DO NOTHING
  `)
}
