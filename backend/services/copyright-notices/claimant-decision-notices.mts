import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getCopyrightClaimantEmail } from './claimant-email.mts'
import { selectCopyrightStatementFacts } from './statement-of-reasons-facts.mts'
import {
  buildCopyrightStatementOfReasons,
  type CopyrightStatementEvent,
} from './statement-of-reasons.mts'
import { createCopyrightStatementDeliveryInTransaction } from './statement-delivery.mts'

export async function createCopyrightClaimantDecisionNoticeInTransaction(
  input: {
    noticeId: string
    event: Exclude<CopyrightStatementEvent, 'restriction_ended'>
    restrictionId?: string
    assessmentId?: string
  },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows } = await transaction<{
    claimant_user_id: string | null
    already_rejected: boolean
  }>(sql`/* createCopyrightClaimantDecisionNoticeInTransaction:recipient */
    SELECT claimant_user_id, EXISTS (SELECT 1 FROM copyright_notice_delivery_intents
      WHERE idempotency_key IN (${`copyright-decision:${input.noticeId}:not_accepted:claimant`}, ${`copyright-decision:${input.noticeId}:not_accepted:claimant:email`})) AS already_rejected
    FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE
  `)
  const notice = rows[0]
  assert(notice, 404, 'Copyright notice not found')
  if (input.event === 'reversed' && notice.already_rejected) return
  const facts = await selectCopyrightStatementFacts(input.noticeId, transaction, input)
  const statement = buildCopyrightStatementOfReasons({
    ...facts,
    automatedDecision: input.event === 'restricted' && facts.automatedDecision,
    audience: 'claimant',
    event: input.event,
  })
  const email = await getCopyrightClaimantEmail(input.noticeId, transaction)
  await createCopyrightStatementDeliveryInTransaction(
    {
      noticeId: input.noticeId,
      recipientUserId: notice.claimant_user_id,
      recipientRole: 'claimant',
      recipientEmail: email,
      deliveryKind: 'claimant_decision_notice',
      correspondenceKind: 'decision_notice',
      key: `copyright-decision:${input.noticeId}:${input.event}:claimant`,
      text: statement.text,
    },
    transaction,
  )
}
