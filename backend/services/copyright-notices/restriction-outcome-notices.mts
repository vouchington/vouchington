import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import { decryptCopyrightClaimantEmail } from './claimant-email.mts'
import { selectCopyrightDeliveryInputs } from './delivery-inputs.mts'
import {
  claimantDecisionDelivery,
  claimantDecisionIsOwed,
  lockCopyrightClaimantDecisionState,
  type CopyrightClaimantDecisionEvent,
} from './claimant-decision-notices.mts'
import {
  buildCopyrightPosterNoticeDeliveries,
  posterPurposes,
  type CopyrightPosterNoticeInput,
} from './restriction-poster-notices.mts'
import {
  createCopyrightStatementDeliveriesInTransaction,
  type CopyrightStatementDeliveryInput,
} from './statement-delivery.mts'

export type CopyrightRestrictionDecisionNoticeInput = CopyrightPosterNoticeInput & {
  event: CopyrightClaimantDecisionEvent
}

/**
 * Notifies the posters (and informed community owners) and the claimant of one restriction
 * decision. Both statements describe the same restriction, so the facts are read once and every
 * delivery is created together. The claimant locks the notice before the facts are read.
 */
export async function createCopyrightRestrictionDecisionNoticesInTransaction(
  input: CopyrightRestrictionDecisionNoticeInput,
  transaction: TransactionQuery,
): Promise<void> {
  await createCopyrightStatementDeliveriesInTransaction(
    await buildCopyrightRestrictionDecisionDeliveries([input], transaction),
    transaction,
  )
}

/**
 * The deliveries several restriction decisions of one notice owe, read with one statement for the
 * claimant lock and one for the facts, recipients and claimant address. The claimant is told once per event, from the
 * first decision of that event, as sequential creation would find it.
 */
export async function buildCopyrightRestrictionDecisionDeliveries(
  inputs: readonly CopyrightRestrictionDecisionNoticeInput[],
  transaction: TransactionQuery,
): Promise<CopyrightStatementDeliveryInput[]> {
  const first = inputs[0]
  if (!first) return []
  const { noticeId } = first
  assert(
    inputs.every(input => input.noticeId === noticeId),
    500,
    'Restriction decisions must share one notice',
  )
  const claimantState = await lockCopyrightClaimantDecisionState(noticeId, transaction)
  // The facts, recipients and claimant address are independent reads of the post-lock snapshot.
  const { facts, parties, claimantEmail } = await selectCopyrightDeliveryInputs(
    noticeId,
    transaction,
    {
      authorities: inputs.map(input => ({
        targetId: input.targetId,
        restrictionId: input.restrictionId,
      })),
      targetIds: [...new Set(inputs.map(input => input.targetId))],
      purposes: [...new Set(inputs.flatMap(posterPurposes))],
    },
  )
  // The claimant's address is decrypted once, and only when a claimant is told.
  const claimantAddress = inputs.some(input => claimantDecisionIsOwed(claimantState, input.event))
    ? decryptCopyrightClaimantEmail(claimantEmail)
    : null
  const told = new Set<CopyrightClaimantDecisionEvent>()
  const deliveries: CopyrightStatementDeliveryInput[] = []
  for (const [index, input] of inputs.entries()) {
    const decisionFacts = facts[index]!
    deliveries.push(...buildCopyrightPosterNoticeDeliveries(input, decisionFacts, parties))
    if (told.has(input.event) || !claimantDecisionIsOwed(claimantState, input.event)) continue
    told.add(input.event)
    deliveries.push(claimantDecisionDelivery(input, claimantState, decisionFacts, claimantAddress))
  }
  return deliveries
}
