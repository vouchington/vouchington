import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  copyrightEmailOwnMessageIdIsAmbiguousSql,
  copyrightEmailReferencedTokenIsAmbiguousSql,
} from './email-thread-review-path.mts'

/**
 * Links replies that arrived before a case, including chains. A reply whose ancestors are not all
 * on this notice is left unlinked, so the first case to arrive cannot claim it.
 */
export async function linkPendingCopyrightEmailRepliesInTransaction(
  input: {
    initialIntakeId: string
    noticeId: string
    descendantIntakeIds: readonly string[]
    graphIntakeIds: readonly string[]
  },
  transaction: TransactionQuery,
): Promise<void> {
  if (input.descendantIntakeIds.length === 0) return
  const linkQuery = sql`/* linkPendingCopyrightEmailRepliesInTransaction:links */
    WITH RECURSIVE descendants(intake_id) AS (
      SELECT unnest(${[...input.descendantIntakeIds]}::uuid[])
    ),
    graph_intakes(intake_id) AS (
      SELECT unnest(${[...input.graphIntakeIds]}::uuid[])
    ),
    blocked_seeds(intake_id) AS (
      SELECT graph_intake.intake_id
      FROM graph_intakes graph_intake
      JOIN copyright_notice_email_message_ancestors edge
        ON edge.reply_message_intake_receipt_id = graph_intake.intake_id
      LEFT JOIN copyright_notice_email_intake_notice_links ancestor_link
        ON ancestor_link.copyright_notice_email_intake_id = edge.ancestor_message_intake_receipt_id
      WHERE (
        edge.ancestor_message_intake_receipt_id <> ${input.initialIntakeId}
        AND NOT EXISTS (
          SELECT 1 FROM descendants earlier WHERE earlier.intake_id = edge.ancestor_message_intake_receipt_id
        )
        AND ancestor_link.copyright_notice_id IS DISTINCT FROM ${input.noticeId}
      ) OR EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_notice_links existing_link
        WHERE existing_link.copyright_notice_email_intake_id = graph_intake.intake_id
          AND existing_link.copyright_notice_id IS DISTINCT FROM ${input.noticeId}
      )
      UNION
      SELECT descendant.intake_id FROM descendants descendant WHERE `
  linkQuery.append(copyrightEmailReferencedTokenIsAmbiguousSql(sql`descendant.intake_id`))
  linkQuery.append(sql` OR (NOT EXISTS (
    SELECT 1 FROM copyright_notice_email_message_ancestors retained_edge
    WHERE retained_edge.reply_message_intake_receipt_id = descendant.intake_id
  ) AND `)
  linkQuery.append(copyrightEmailOwnMessageIdIsAmbiguousSql(sql`descendant.intake_id`))
  linkQuery.append(sql`)
    ),
    blocked(intake_id) AS (
      SELECT intake_id FROM blocked_seeds
      UNION
      SELECT edge.reply_message_intake_receipt_id
      FROM blocked blocked_intake
      JOIN copyright_notice_email_message_ancestors edge
        ON edge.ancestor_message_intake_receipt_id = blocked_intake.intake_id
      JOIN graph_intakes graph_intake ON graph_intake.intake_id = edge.reply_message_intake_receipt_id
    )
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind, correspondence_action
    )
    SELECT descendant.intake_id, ${input.noticeId}, 'thread', 'pending'
    FROM descendants descendant
    JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = descendant.intake_id
    WHERE NOT EXISTS (
      SELECT 1 FROM blocked blocked_intake WHERE blocked_intake.intake_id = descendant.intake_id
    )
      AND receipt.review_decision IS NULL
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links existing_link
        WHERE existing_link.copyright_notice_email_intake_id = descendant.intake_id)
    ORDER BY descendant.intake_id
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
  `)
  await transaction(linkQuery)
}
