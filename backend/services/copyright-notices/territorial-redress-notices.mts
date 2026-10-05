import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getCopyrightClaimantEmail } from './claimant-email.mts'
import { createCopyrightStatementDeliveryInTransaction } from './statement-delivery.mts'

/** A reasoned complaint outcome goes only to the complainant, after decision consequences exist. */
export async function createTerritorialRedressDecisionNotice(
  input: {
    noticeId: string
    redressId: string
    disposition: 'maintain' | 'revoke'
    rationale: string
  },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows } = await transaction<{
    jurisdiction: 'eu_dsa' | 'uk'
    filed_by: 'notifier' | 'poster' | 'reviewer'
    submitted_by_id: string | null
    outcome: 'restrict' | 'no_action'
  }>(sql`/* createTerritorialRedressDecisionNotice:recipient */
    SELECT request.jurisdiction, request.filed_by, request.submitted_by_id, decision.outcome
    FROM copyright_territorial_redress_requests request
    JOIN copyright_territorial_decisions decision
      ON decision.id = request.copyright_territorial_decision_id
    WHERE request.id = ${input.redressId} AND request.copyright_notice_id = ${input.noticeId}
  `)
  const request = rows[0]
  if (!request || request.jurisdiction !== 'eu_dsa' || request.filed_by === 'reviewer') return

  const result =
    input.disposition === 'maintain'
      ? 'Your complaint was not upheld. The decision remains in effect.'
      : request.outcome === 'no_action'
        ? 'Your complaint was upheld. The notice is back with staff for a new decision; no material was restored.'
        : 'Your complaint was upheld. The restriction is being lifted; restoration delivery may take time.'
  const text = [
    `Decision on your complaint in copyright case ${input.noticeId}: ${result}`,
    `Our reason: ${input.rationale}`,
    'You may seek out-of-court dispute settlement under DSA Article 21 or judicial redress through a court.',
  ].join('\n\n')
  const notifier = request.filed_by === 'notifier'
  await createCopyrightStatementDeliveryInTransaction(
    {
      noticeId: input.noticeId,
      recipientUserId: request.submitted_by_id,
      recipientRole: notifier ? 'claimant' : 'poster',
      recipientEmail: notifier
        ? await getCopyrightClaimantEmail(input.noticeId, transaction)
        : undefined,
      deliveryKind: 'redress_decision_notice',
      correspondenceKind: 'decision_notice',
      key: `copyright-redress-decision:${input.redressId}`,
      text,
    },
    transaction,
  )
}
