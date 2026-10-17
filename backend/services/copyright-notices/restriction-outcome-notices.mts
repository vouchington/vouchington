import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import { getCopyrightClaimantEmail } from './claimant-email.mts'
import {
  claimantDecisionDelivery,
  claimantDecisionIsOwed,
  lockCopyrightClaimantDecisionState,
  type CopyrightClaimantDecisionEvent,
} from './claimant-decision-notices.mts'
import {
  buildCopyrightPosterNoticeDeliveries,
  posterPurposes,
  selectCopyrightTargetPosters,
  type CopyrightPosterNoticeInput,
} from './restriction-poster-notices.mts'
import {
  createCopyrightStatementDeliveriesInTransaction,
  type CopyrightStatementDeliveryInput,
} from './statement-delivery.mts'
import { selectCopyrightStatementFactsBatch } from './statement-of-reasons-facts.mts'

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
 * The deliveries several restriction decisions of one notice owe, read with one statement each for
 * the facts, the recipients and the claimant lock. The claimant is told once per event, from the
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
  // oxlint-disable-next-line react-doctor/async-parallel -- one transaction client; the notice lock precedes the reads.
  const claimantState = await lockCopyrightClaimantDecisionState(noticeId, transaction)
  const facts = await selectCopyrightStatementFactsBatch(
    noticeId,
    transaction,
    inputs.map(input => ({ targetId: input.targetId, restrictionId: input.restrictionId })),
  )
  const parties = await selectCopyrightTargetPosters(
    [...new Set(inputs.map(input => input.targetId))],
    transaction,
    [...new Set(inputs.flatMap(posterPurposes))],
  )
  // The claimant's address is read once, and only when a claimant is told.
  const claimantEmail = inputs.some(input => claimantDecisionIsOwed(claimantState, input.event))
    ? await getCopyrightClaimantEmail(noticeId, transaction)
    : null
  const told = new Set<CopyrightClaimantDecisionEvent>()
  const deliveries: CopyrightStatementDeliveryInput[] = []
  for (const [index, input] of inputs.entries()) {
    const decisionFacts = facts[index]!
    deliveries.push(...buildCopyrightPosterNoticeDeliveries(input, decisionFacts, parties))
    if (told.has(input.event) || !claimantDecisionIsOwed(claimantState, input.event)) continue
    told.add(input.event)
    deliveries.push(claimantDecisionDelivery(input, claimantState, decisionFacts, claimantEmail))
  }
  return deliveries
}
