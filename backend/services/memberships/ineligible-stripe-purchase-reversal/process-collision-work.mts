import { beginTransaction } from '@data-stores/psql'
import { mapWithConcurrency } from '@vouchington/utils/async'
import { reconcileRecordedIneligibleStripePurchaseReversal } from '../reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import {
  recordPreparedIneligibleStripePurchaseCasesForCollision,
  type PreparedIneligibleStripePurchaseCaseInput,
} from './case-creation.mts'
import {
  buildStripePurchaseCollisionCaseInputs,
  prepareStripePurchaseCollisionCandidates,
} from './case-producer.mts'
import {
  chooseEarliestQualifyingStripeCollision,
  getEarliestCapturedStripeCollisions,
} from './collision-resolution.mts'
import { recordStripePurchaseCollisionReviews } from './collision-review.mts'
import {
  completeStripePurchaseCollisionWork,
  loadStripePurchaseCollisionWork,
} from './collision-work.mts'

/** Stripe listing and reconciliation run outside the short case insert transaction. */
export async function processStripePurchaseCollisionWork(workId: string): Promise<void> {
  const work = await loadStripePurchaseCollisionWork(workId)
  if (!work) return
  const candidates = await prepareStripePurchaseCollisionCandidates(work)
  let caseInputs: PreparedIneligibleStripePurchaseCaseInput[]
  {
    await using transaction = await beginTransaction()
    const purchasePlans = [
      ...new Set(candidates.flatMap(candidate => candidate.mappedLines.map(line => line.plan))),
    ]
    const collisions = await getEarliestCapturedStripeCollisions(work, purchasePlans, transaction)
    for (const plan of purchasePlans) {
      const collision = chooseEarliestQualifyingStripeCollision(collisions.get(plan), work, plan)
      if (collision) collisions.set(plan, collision)
    }
    const prepared = buildStripePurchaseCollisionCaseInputs(
      candidates,
      work.sourceIdentity,
      collisions,
    )
    caseInputs = prepared.caseInputs
    await recordPreparedIneligibleStripePurchaseCasesForCollision(
      caseInputs,
      { id: work.sourceId, lineageId: work.lineageId, bindingId: work.bindingId },
      transaction,
    )
    await recordStripePurchaseCollisionReviews(prepared.ambiguousInvoices, work, transaction)
    await transaction.commit()
  }
  await mapWithConcurrency(caseInputs, 1, async input => {
    await reconcileRecordedIneligibleStripePurchaseReversal({
      originatingInvoiceId: input.invoice.id,
      providerApplicationId: work.sourceIdentity.applicationId,
      providerEnvironment: work.sourceIdentity.environment,
    })
  })
  await completeStripePurchaseCollisionWork(workId)
}
