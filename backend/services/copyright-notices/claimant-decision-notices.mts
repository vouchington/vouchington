import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  claimantDecisionIsOwed,
  selectCopyrightClaimantDecisionFlags,
} from './claimant-decision-flags.mts'
import { getCopyrightClaimantEmail } from './claimant-email.mts'
import {
  selectCopyrightStatementFacts,
  type CopyrightStatementFacts,
} from './statement-of-reasons-facts.mts'
import {
  buildCopyrightStatementOfReasons,
  type CopyrightStatementEvent,
} from './statement-of-reasons.mts'
import {
  createCopyrightStatementDeliveriesInTransaction,
  type CopyrightStatementDeliveryInput,
} from './statement-delivery.mts'

export type CopyrightClaimantDecisionEvent = Exclude<CopyrightStatementEvent, 'restriction_ended'>

export type CopyrightClaimantDecisionNoticeInput = {
  noticeId: string
  event: CopyrightClaimantDecisionEvent
  restrictionId?: string
  assessmentId?: string
}

export async function createCopyrightClaimantDecisionNoticeInTransaction(
  input: CopyrightClaimantDecisionNoticeInput,
  transaction: TransactionQuery,
): Promise<void> {
  const delivery = await buildCopyrightClaimantDecisionDelivery(input, transaction)
  if (delivery) await createCopyrightStatementDeliveriesInTransaction([delivery], transaction)
}

/** The claimant's decision delivery for one event, or null when none is owed. */
export async function buildCopyrightClaimantDecisionDelivery(
  input: CopyrightClaimantDecisionNoticeInput,
  transaction: TransactionQuery,
): Promise<CopyrightStatementDeliveryInput | null> {
  const { claimant_user_id } = await lockCopyrightNoticeForClaimantDecision(
    input.noticeId,
    transaction,
  )
  const flags = await selectCopyrightClaimantDecisionFlags(input.noticeId, transaction)
  if (!claimantDecisionIsOwed(flags, input.event)) return null
  const facts = await selectCopyrightStatementFacts(input.noticeId, transaction, input)
  return claimantDecisionDelivery(
    input,
    claimant_user_id,
    facts,
    await getCopyrightClaimantEmail(input.noticeId, transaction),
  )
}

/** Locks the notice. The decision flags are read after it, in their own statement. */
export async function lockCopyrightNoticeForClaimantDecision(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<{ claimant_user_id: string | null }> {
  const { rows } = await transaction<{ claimant_user_id: string | null }>(
    sql`/* createCopyrightClaimantDecisionNoticeInTransaction:recipient */
    SELECT claimant_user_id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `,
  )
  assert(rows[0], 404, 'Copyright notice not found')
  return rows[0]
}

/** The claimant statement never uses the facts' target URLs, so any authority's facts serve. */
export function claimantDecisionDelivery(
  input: CopyrightClaimantDecisionNoticeInput,
  claimantUserId: string | null,
  facts: CopyrightStatementFacts,
  email: string | null,
): CopyrightStatementDeliveryInput {
  const statement = buildCopyrightStatementOfReasons({
    ...facts,
    automatedDecision: input.event === 'restricted' && facts.automatedDecision,
    audience: 'claimant',
    event: input.event,
  })
  return {
    noticeId: input.noticeId,
    recipientUserId: claimantUserId,
    recipientRole: 'claimant',
    recipientEmail: email,
    deliveryKind: 'claimant_decision_notice',
    correspondenceKind: 'decision_notice',
    key: `copyright-decision:${input.noticeId}:${input.event}:claimant`,
    text: statement.text,
  }
}
