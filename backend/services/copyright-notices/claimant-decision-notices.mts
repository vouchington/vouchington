import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
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

export type CopyrightClaimantDecisionState = {
  claimant_user_id: string | null
  already_rejected: boolean
  later_restricted: boolean
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
  const state = await lockCopyrightClaimantDecisionState(input.noticeId, transaction)
  if (!claimantDecisionIsOwed(state, input.event)) return null
  const facts = await selectCopyrightStatementFacts(input.noticeId, transaction, input)
  return claimantDecisionDelivery(
    input,
    state,
    facts,
    await getCopyrightClaimantEmail(input.noticeId, transaction),
  )
}

/** Locks the notice and reads which claimant decisions it already carries. */
export async function lockCopyrightClaimantDecisionState(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<CopyrightClaimantDecisionState> {
  const { rows } = await transaction<CopyrightClaimantDecisionState>(
    sql`/* createCopyrightClaimantDecisionNoticeInTransaction:recipient */
    SELECT claimant_user_id, EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items
      WHERE idempotency_key IN (${`copyright-decision:${noticeId}:not_accepted:claimant`}, ${`copyright-decision:${noticeId}:not_accepted:claimant:email`})) AS already_rejected,
      EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items restricted_intent
        WHERE restricted_intent.idempotency_key IN (
          ${`copyright-decision:${noticeId}:restricted:claimant`},
          ${`copyright-decision:${noticeId}:restricted:claimant:email`}
        )) AS later_restricted
    FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `,
  )
  assert(rows[0], 404, 'Copyright notice not found')
  return rows[0]
}

export function claimantDecisionIsOwed(
  state: CopyrightClaimantDecisionState,
  event: CopyrightClaimantDecisionEvent,
): boolean {
  return !(event === 'reversed' && state.already_rejected && !state.later_restricted)
}

/** The claimant statement never uses the facts' target URLs, so any authority's facts serve. */
export function claimantDecisionDelivery(
  input: CopyrightClaimantDecisionNoticeInput,
  state: CopyrightClaimantDecisionState,
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
    recipientUserId: state.claimant_user_id,
    recipientRole: 'claimant',
    recipientEmail: email,
    deliveryKind: 'claimant_decision_notice',
    correspondenceKind: 'decision_notice',
    key: `copyright-decision:${input.noticeId}:${input.event}:claimant`,
    text: statement.text,
  }
}
