import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import * as stripeClient from '../modules/stripe/client.mts'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership } from '../services/memberships/create.mts'
import { getMembershipSourceIdByMembershipId } from '../services/memberships/index.mts'
import { getStripeMembershipSourceIdentity } from '../services/memberships/create-types.mts'
const start = 1_740_000_000
const end = start + 100

export async function setupStripeCollisionProducer(plan: 'plus' | 'pro', history = false) {
  const user = await createTestUser()
  const suffix = randomUUID()
  const applicationId = `producer-${suffix}`
  const subscriptionId = `sub_${suffix}`
  const chargeId = `ch_${suffix}`
  const refundId = `re_${suffix}`
  const invoiceId = `in_${suffix}`
  const sku = await createTestSku({ plan, provider_application_id: applicationId })
  const lines = [
    {
      id: `il_${suffix}`,
      currency: 'usd',
      pricing: { price_details: { price: sku.stripe_price_id } },
      period: { start, end },
    },
  ]
  const invoice = {
    id: invoiceId,
    status: 'paid',
    total: 100,
    currency: 'usd',
    created: start,
    payments: {
      has_more: false,
      data: [{ status: 'paid', amount_paid: 100, payment: { type: 'charge', charge: chargeId } }],
    },
  }
  const oldInvoice = { ...invoice, id: `in_old_${suffix}` }
  const oldLines = [lines[0], lines[0]].map(line => ({
    ...line,
    period: { start: start - 200, end: start - 100 },
  }))
  const cancel = vi.fn<VitestLooseMock>().mockResolvedValue({})
  const createRefund = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ id: refundId, amount: 100, currency: 'usd', status: 'succeeded' })
  const invoicesList = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ data: history ? [oldInvoice, invoice] : [invoice], has_more: false })
  vi.spyOn(stripeClient, 'getStripeClient').mockReturnValue({
    invoices: {
      list: invoicesList,
      listLineItems: vi.fn<VitestLooseMock>().mockImplementation(async id => ({
        data: id === oldInvoice.id ? oldLines : lines,
        has_more: false,
      })),
    },
    refunds: {
      list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }),
      create: createRefund,
    },
    disputes: { list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }) },
    subscriptions: { cancel },
  } as unknown as ReturnType<typeof stripeClient.getStripeClient>)
  const sourceIdentity = getStripeMembershipSourceIdentity({
    stripeSubscriptionId: subscriptionId,
    providerApplicationId: applicationId,
  })
  const stripeMembership = await createMembership({
    userId: user.id,
    plan,
    skuId: sku.id,
    stripeSubscriptionId: subscriptionId,
    providerApplicationId: applicationId,
    providerEnvironment: 'production',
    effectiveAt: new Date(start * 1_000),
    expiresAt: new Date('2040-01-01T00:00:00.000Z'),
  })
  const sourceId = await getMembershipSourceIdByMembershipId(stripeMembership.id)
  if (!sourceId) throw new Error('Expected Stripe membership source id')
  const lookup = {
    originatingInvoiceId: invoiceId,
    providerEnvironment: 'production' as const,
    providerApplicationId: applicationId,
  }
  return {
    userId: user.id,
    sourceIdentity,
    sourceId,
    invoice,
    lines,
    oldInvoice,
    oldLines,
    cancel,
    createRefund,
    invoicesList,
    subscriptionId,
    chargeId,
    refundId,
    lookup,
  }
}
