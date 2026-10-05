import { claimTestIneligiblePurchaseReversalOperations } from '@voucha/test-helpers/membership-reversal-case-fixtures'
import { randomUUID } from 'node:crypto'
import { createTestFamilyMembership, createTestSku, createTestUser } from '@voucha/test-helpers'
import { getIneligiblePurchaseReversalCase } from '../../../services/memberships/ineligible-stripe-purchase-reversal/case-read.mts'

export async function createRefundScanCase() {
  const [user, familySku, incomingSku] = await Promise.all([
    createTestUser(),
    createTestSku({ plan: 'pro' }),
    createTestSku({ plan: 'plus' }),
  ])
  const invoiceId = `in_refund_scan_${randomUUID()}`
  const subscriptionId = `sub_refund_scan_${randomUUID()}`
  await createTestFamilyMembership({
    applicationId: familySku.provider_application_id,
    effectiveAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
    membershipProductId: familySku.id,
    membershipProviderProductId: familySku.membership_provider_product_id,
    userId: user.id,
  })
  const target = {
    chargeId: `ch_refund_scan_${randomUUID()}`,
    currency: 'usd',
    invoiceId,
    paymentIntentId: null,
  }
  await claimTestIneligiblePurchaseReversalOperations(
    {
      customerId: `cus_refund_scan_${randomUUID()}`,
      effectiveAt: new Date(Date.now() - 30_000),
      expiresAt: new Date(Date.now() + 30_000),
      incomingPlan: 'plus',
      incomingStatus: 'active',
      originatingInvoiceId: invoiceId,
      providerEnvironment: 'test',
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    },
    [{ ...target, amountMinorUnits: 1_000, qualifyingAmountMinorUnits: 1_000 }],
    { currency: 'usd', qualifyingAmountMinorUnits: 1_000 },
  )
  const reversalCase = await getIneligiblePurchaseReversalCase({
    originatingInvoiceId: invoiceId,
    providerEnvironment: 'test',
  })
  if (!reversalCase) throw new Error('Could not create a refund scan reversal case')
  return {
    firstRefundId: `re_refund_scan_first_${randomUUID()}`,
    reversalCaseId: reversalCase.id,
    secondRefundId: `re_refund_scan_second_${randomUUID()}`,
    target,
  }
}
