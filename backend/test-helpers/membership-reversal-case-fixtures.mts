import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getLockedIneligiblePurchaseReversalCase } from '../services/memberships/ineligible-stripe-purchase-reversal/case-ledger.mts'
import {
  claimIneligiblePurchaseReversalCaseForDiscovery,
  claimPersistedIneligiblePurchaseReversalCase,
} from '../services/memberships/ineligible-stripe-purchase-reversal/claim-ledger.mts'
import type { StripeRefund } from '../services/memberships/ineligible-stripe-purchase-reversal/refund-history.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  type StripeRefundScanTarget,
} from '../services/memberships/ineligible-stripe-purchase-reversal/refund-scan.mts'

export async function claimTestIneligiblePurchaseReversalOperations(
  options: Parameters<typeof claimIneligiblePurchaseReversalCaseForDiscovery>[0],
  targets: Parameters<typeof claimPersistedIneligiblePurchaseReversalCase>[1],
  snapshot: Parameters<typeof claimIneligiblePurchaseReversalCaseForDiscovery>[1],
) {
  const discovery = await claimIneligiblePurchaseReversalCaseForDiscovery(options, snapshot)
  if (discovery.disposition !== 'ineligible')
    throw new Error('Expected an ineligible purchase reversal fixture')
  const reversalCase = discovery.reversalCase
  const claim = await claimPersistedIneligiblePurchaseReversalCase(
    {
      originatingInvoiceId: reversalCase.originatingInvoiceId,
      providerApplicationId: reversalCase.providerApplicationId,
      providerEnvironment: reversalCase.providerEnvironment,
      subscriptionId: reversalCase.subscriptionId,
    },
    targets,
  )
  if (!claim) throw new Error('Could not claim the persisted purchase reversal fixture')
  return claim
}

export async function readTestStripeRefundHistory(
  refunds: readonly StripeRefund[],
  target: StripeRefundScanTarget,
  reversalCaseId: string,
) {
  return getDurableStripeRefundHistory({
    callBudget: createStripeRefundScanCallBudget(),
    listRefundsForPaymentPage: async () => ({ hasMore: false, nextCursor: undefined, refunds }),
    reversalCaseId,
    target,
  })
}

export async function assertReversalClaimLeavesProviderContextUnlockedForTest(options: {
  originatingInvoiceId: string
  providerApplicationId: string
  providerEnvironment: 'test' | 'production'
  subscriptionId: string
}): Promise<void> {
  await using contextTransaction = await beginTransaction()
  const { rows: contexts } =
    await contextTransaction(sql`/* holdOwnedReversalProviderContextForTest */
    SELECT id FROM membership_provider_contexts
    WHERE provider = 'stripe' AND environment = ${options.providerEnvironment}
      AND application_id = ${options.providerApplicationId}
    FOR UPDATE NOWAIT`)
  if (contexts.length !== 1) throw new Error('Expected the owned reversal provider context')

  // The completed PostgreSQL lock query is the barrier: the claim runs while that row is held.
  await using caseTransaction = await beginTransaction()
  const reversalCase = await getLockedIneligiblePurchaseReversalCase(options, caseTransaction)
  if (!reversalCase) throw new Error('Expected the owned reversal case')
  await caseTransaction.rollback()
  await contextTransaction.rollback()
}
