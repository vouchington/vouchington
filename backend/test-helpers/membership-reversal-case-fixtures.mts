import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestPersistedReversalCaseFixture } from './data-stores/psql/membership-reversal-cases.mts'
import { getLockedIneligiblePurchaseReversalCase } from '../services/memberships/ineligible-stripe-purchase-reversal/case-ledger.mts'
import { claimPersistedIneligiblePurchaseReversalCase } from '../services/memberships/ineligible-stripe-purchase-reversal/claim-ledger.mts'
import type { StripeRefund } from '../services/memberships/ineligible-stripe-purchase-reversal/refund-history.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  type StripeRefundScanTarget,
} from '../services/memberships/ineligible-stripe-purchase-reversal/refund-scan.mts'

type TestReversalCaseIdentity = {
  userId: string
  originatingInvoiceId: string
  providerApplicationId?: string
  providerEnvironment: 'test' | 'production'
  subscriptionId: string
  stripePriceId: string
  effectiveAt?: Date
  expiresAt?: Date
}

export async function claimTestIneligiblePurchaseReversalOperations(
  options: TestReversalCaseIdentity,
  targets: Parameters<typeof claimPersistedIneligiblePurchaseReversalCase>[1],
  snapshot: {
    currency: string
    qualifyingAmountMinorUnits: number
    refundCapMinorUnits?: number
    winningSourceKind?: 'admin_grant' | 'direct' | 'family'
    periodStartedAt?: Date
    periodEndsAt?: Date
    collisionAt?: Date
  },
) {
  const now = new Date()
  const periodStartedAt = snapshot.periodStartedAt ?? options.effectiveAt ?? now
  await createTestPersistedReversalCaseFixture({
    userId: options.userId,
    originatingInvoiceId: options.originatingInvoiceId,
    providerApplicationId: options.providerApplicationId ?? 'voucha-web',
    providerEnvironment: options.providerEnvironment,
    subscriptionId: options.subscriptionId,
    stripePriceId: options.stripePriceId,
    currency: snapshot.currency,
    qualifyingAmountMinorUnits: snapshot.qualifyingAmountMinorUnits,
    refundCapMinorUnits: snapshot.refundCapMinorUnits ?? snapshot.qualifyingAmountMinorUnits,
    winningSourceKind: snapshot.winningSourceKind ?? 'direct',
    periodStartedAt,
    periodEndsAt: snapshot.periodEndsAt ?? options.expiresAt ?? periodStartedAt,
    collisionAt: snapshot.collisionAt ?? now,
  })
  const claim = await claimPersistedIneligiblePurchaseReversalCase(
    {
      originatingInvoiceId: options.originatingInvoiceId,
      providerApplicationId: options.providerApplicationId ?? 'voucha-web',
      providerEnvironment: options.providerEnvironment,
      subscriptionId: options.subscriptionId,
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
