import { beginTransaction } from '@data-stores/psql'
import { mapWithConcurrency } from '@vouchington/utils/async'
import { reconcileRecordedIneligibleStripePurchaseReversal } from '../reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import { recordPreparedIneligibleStripePurchaseCasesForCollision } from './case-creation.mts'
import { prepareIneligibleStripePurchaseCasesForWinner } from './case-producer.mts'
import {
  completeStripePurchaseCollisionWork,
  loadStripePurchaseCollisionWork,
} from './collision-work.mts'

/** Stripe listing and reconciliation run outside the short case insert transaction. */
export async function processStripePurchaseCollisionWork(workId: string): Promise<void> {
  const work = await loadStripePurchaseCollisionWork(workId)
  if (!work) return
  const caseInputs = await prepareIneligibleStripePurchaseCasesForWinner(work)
  {
    await using transaction = await beginTransaction()
    await recordPreparedIneligibleStripePurchaseCasesForCollision(
      caseInputs,
      { id: work.sourceId, lineageId: work.lineageId, bindingId: work.bindingId },
      transaction,
    )
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
