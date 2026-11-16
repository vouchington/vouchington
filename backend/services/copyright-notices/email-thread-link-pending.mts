import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  copyrightEmailOwnMessageIdIsAmbiguousSql,
  copyrightEmailReferencedTokenIsAmbiguousSql,
} from './email-thread-review-path.mts'
import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'
import { hasRetiredCopyrightEmailThreadIntakes } from './email-thread-source.mts'
import { maintainCopyrightEmailThreadLinkActivities } from './email-thread-link-activity.mts'
import { readBoundedCopyrightEmailAncestorSourceIds } from './email-thread-ancestor-graph.mts'
import { getCopyrightEmailThreadGraphMaxRows } from './config.mts'

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
    retired_graph_intakes(intake_id) AS (
      SELECT graph_intake.intake_id
      FROM graph_intakes graph_intake
      JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = graph_intake.intake_id
      JOIN copyright_notice_thread_retention_activities retirement
        ON retirement.copyright_notice_id = link.copyright_notice_id
      WHERE retirement.retired_before_intake_bound > graph_intake.intake_id
      UNION
      SELECT graph_intake.intake_id
      FROM graph_intakes graph_intake
      JOIN copyright_notice_thread_retention_activities retirement
        ON retirement.copyright_notice_id = ${input.noticeId}
      WHERE retirement.retired_before_intake_bound > graph_intake.intake_id
    ),
    blocked_seeds(intake_id) AS (
      SELECT intake_id FROM retired_graph_intakes
      UNION
      SELECT graph_intake.intake_id
      FROM graph_intakes graph_intake
      JOIN copyright_notice_email_message_ancestors edge
        ON edge.reply_message_intake_receipt_id = graph_intake.intake_id
      LEFT JOIN copyright_notice_email_intake_notice_links ancestor_link
        ON ancestor_link.copyright_notice_email_intake_id = edge.ancestor_message_intake_receipt_id
      WHERE (
        edge.ancestor_message_intake_receipt_id <> ${input.initialIntakeId}
        AND NOT EXISTS (
          SELECT 1 FROM retired_graph_intakes retired
          WHERE retired.intake_id IN (
            edge.reply_message_intake_receipt_id,
            edge.ancestor_message_intake_receipt_id
          )
        )
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
      AND NOT EXISTS (
        SELECT 1 FROM retired_graph_intakes retired
        WHERE retired.intake_id IN (
          retained_edge.reply_message_intake_receipt_id,
          retained_edge.ancestor_message_intake_receipt_id
        )
      )
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
    ),
    inserted(intake_id) AS (
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
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_thread_retention_activities retirement
          WHERE retirement.copyright_notice_id = ${input.noticeId}
            AND retirement.retired_before_intake_bound > descendant.intake_id
        )
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links existing_link
          WHERE existing_link.copyright_notice_email_intake_id = descendant.intake_id)
      ORDER BY descendant.intake_id
      ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
      RETURNING copyright_notice_email_intake_id AS intake_id
    )
    SELECT intake_id FROM inserted ORDER BY intake_id
  `)
  const { rows: insertedLinks } = await transaction<{ intake_id: string }>(linkQuery)
  if (insertedLinks.length > 0) {
    const linkedIntakeIds = insertedLinks.map(row => row.intake_id)
    const sourceIntakeIds = await readBoundedCopyrightEmailAncestorSourceIds(
      transaction,
      linkedIntakeIds,
      await getCopyrightEmailThreadGraphMaxRows(),
    )
    if (!sourceIntakeIds) throw copyrightEmailThreadChangedError()
    await maintainCopyrightEmailThreadLinkActivities(transaction, {
      noticeId: input.noticeId,
      intakeIds: linkedIntakeIds,
      authorizingAncestorIntakeIds: sourceIntakeIds,
    })
  }
  if (await hasRetiredCopyrightEmailThreadIntakes(transaction, input.graphIntakeIds))
    throw copyrightEmailThreadChangedError()
}
