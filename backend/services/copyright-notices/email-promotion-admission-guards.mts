import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightEmailThreadGraph } from './email-thread-graph.mts'

export function logCopyrightEmailGraphOverflow(
  noticeId: string,
  graph: CopyrightEmailThreadGraph,
): void {
  console.info('copyright_email_thread_graph_overflow', {
    noticeId,
    observedRows: graph.observedRows,
  })
}

export function logCopyrightEmailTokenOverflow(noticeId: string, maxRows: number): void {
  console.info('copyright_email_thread_token_overflow', {
    noticeId,
    observedRows: maxRows + 1,
  })
}

export async function assertNoThreadCorrespondenceDecision(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* promoteCopyrightEmailIntake:threadReview */
    SELECT 1
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_email_intake_id = ${intakeId}
      AND link.link_kind = 'thread'
    UNION ALL
    SELECT 1
    FROM copyright_notice_email_intake_notice_links decided_link
    WHERE decided_link.copyright_notice_email_intake_id = ${intakeId}
      AND decided_link.correspondence_action IN ('admitted', 'rejected')
    LIMIT 1
  `)
  assert(!rows[0], 409, 'Thread-linked copyright email cannot be approved as an initial intake')
}

export async function assertRecommendationScope(
  transaction: TransactionQuery,
  recommendationId: string | null,
  intakeId: string,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:recommendation */
    SELECT id FROM copyright_notice_email_intake_recommendation_identities
    WHERE id = ${recommendationId} AND copyright_notice_email_intake_receipt_id = ${intakeId}
  `)
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}
