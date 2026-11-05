import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { vi } from 'vitest'
import * as stripeClient from '../modules/stripe/client.mts'
import {
  createTestFamilyMembership,
  createTestNativeMembershipProviderProduct,
  createTestUnprojectedProviderObservation,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { projectVerifiedProviderMembershipObservation } from '../services/memberships/provider-observation-projection.mts'
import { detectIneligibleStripePurchaseFromInvoicePayment } from '../services/stripe/membership-sync/detect-ineligible-purchase.mts'
const start = 1_740_000_000
const end = start + 100

export async function setupPurchase(
  winnerStart: number | null,
  periodEnd: number,
  winner: 'family' | 'apple_app_store' | 'google_play' | 'microsoft_store' = 'family',
  stripePlan: 'plus' | 'pro' = 'plus',
) {
  const user = await createTestUser()
  const applicationId = `reversal-detection-${randomUUID()}`
  const sku = await createTestSku({ plan: stripePlan, provider_application_id: applicationId })
  if (winnerStart !== null) {
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-${randomUUID()}`,
    })
    if (winner === 'family')
      await createTestFamilyMembership({
        applicationId: familySku.provider_application_id,
        userId: user.id,
        effectiveAt: new Date(winnerStart * 1000),
        expiresAt: new Date('2040-01-01T00:00:00Z'),
        membershipProductId: familySku.id,
        membershipProviderProductId: familySku.membership_provider_product_id,
      })
    else {
      const winnerApplicationId = `winner-${randomUUID()}`
      const providerProduct = await createTestNativeMembershipProviderProduct({
        membershipProductId: familySku.id,
        provider: winner,
        environment: 'test',
        applicationId: winnerApplicationId,
        providerProductId: `product-${randomUUID()}`,
      })
      const observation = await createTestUnprojectedProviderObservation({
        userId: user.id,
        provider: winner,
        environment: 'test',
        applicationId: winnerApplicationId,
        providerLineageId: `winner-${randomUUID()}`,
        membershipProductId: familySku.id,
        membershipProviderProductId: providerProduct.id,
        sourceKind: 'direct',
        effectiveAt: new Date(winnerStart * 1000),
        expiresAt: new Date('2040-01-01T00:00:00Z'),
      })
      await projectVerifiedProviderMembershipObservation({
        userId: user.id,
        membershipProviderObservationId: observation.membershipProviderObservationId,
      })
    }
  }
  const subscriptionId = `sub_${randomUUID()}`
  const priceId = sku.stripe_price_id!
  const lines = [
    {
      currency: 'usd',
      pricing: { price_details: { price: priceId } },
      period: { start, end: periodEnd },
    },
  ]
  const invoice = {
    id: `in_${randomUUID()}`,
    currency: 'usd',
    total: 1001,
    status: 'paid',
    created: start,
    period_start: start - 500,
    period_end: end + 500,
    parent: { subscription_details: { subscription: subscriptionId } },
    payments: {
      has_more: false,
      data: [
        {
          status: 'paid',
          amount_paid: 100,
          payment: { type: 'charge', charge: `ch_${randomUUID()}` },
        },
      ],
    },
  }
  const subscription = {
    livemode: true,
    customer: `cus_${user.id}`,
    items: { data: [{ price: { id: priceId } }] },
    metadata: { membership_purchase_intent_id: undefined as string | undefined },
  }
  vi.spyOn(stripeClient, 'getStripeClient').mockReturnValue({
    invoices: {
      retrieve: vi.fn<VitestLooseMock>().mockResolvedValue(invoice),
      list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [invoice], has_more: false }),
      listLineItems: vi.fn<VitestLooseMock>().mockResolvedValue({ data: lines, has_more: false }),
    },
    subscriptions: {
      retrieve: vi.fn<VitestLooseMock>().mockResolvedValue(subscription),
    },
    customers: {
      retrieve: vi.fn<VitestLooseMock>().mockResolvedValue({ metadata: { userId: user.id } }),
    },
  } as unknown as ReturnType<typeof stripeClient.getStripeClient>)
  const lookup = {
    originatingInvoiceId: invoice.id,
    providerEnvironment: 'production' as const,
    providerApplicationId: applicationId,
  }
  return {
    userId: user.id,
    skuId: sku.id,
    invoice,
    lines,
    lookup,
    priceId,
    subscriptionId,
    subscription,
    createIntent: async () => {
      const { rows } = await write<{ id: string }>(sql`/* createReversalDetectionPurchaseIntent */
        INSERT INTO membership_purchase_intents (user_id, idempotency_key, request_fingerprint,
          membership_provider_product_id, membership_product_id, membership_provider_context_id,
          provider_checkout_id, provider_checkout_url, launched_at)
        VALUES (${user.id}, ${randomUUID()}, ${randomUUID().replaceAll('-', '').padEnd(64, 'a')},
          ${sku.membership_provider_product_id}, ${sku.id},
          fn_upsert_membership_provider_context_id('stripe', 'production', ${applicationId}),
          ${`checkout-${randomUUID()}`}, 'https://checkout.stripe.com/test', CURRENT_TIMESTAMP)
        RETURNING id`)
      return rows[0]!.id
    },
    detect: () =>
      detectIneligibleStripePurchaseFromInvoicePayment(invoice.id, 'production', { applicationId }),
  }
}
