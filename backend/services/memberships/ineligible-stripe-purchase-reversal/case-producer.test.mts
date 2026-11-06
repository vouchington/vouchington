import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeClient from '@modules/stripe/client'
import {
  beginTransaction,
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { getStripeMembershipSourceIdentity } from '../create-types.mts'
import { getIneligiblePurchaseReversalCase } from './case-read.mts'
import { recordIneligibleStripePurchasesForWinner } from './case-producer.mts'

const start = 1_740_000_000
const end = start + 100

describe('ineligible Stripe purchase case producer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reconciles a native winner’s case after commit and persists its refund receipt', async () => {
    const fixture = await setupProducer('plus')
    await using query = await beginTransaction()
    await expect(
      recordIneligibleStripePurchasesForWinner(fixture.options('direct', start), query),
    ).resolves.toBe(1)
    expect(fixture.cancel).not.toHaveBeenCalled()
    await query.commit()
    expect(fixture.cancel).toHaveBeenCalledWith(fixture.subscriptionId)
    expect(fixture.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ charge: fixture.chargeId, amount: 100 }),
      expect.anything(),
    )
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toMatchObject({
      winningSourceKind: 'direct',
      refundCapMinorUnits: 100,
    })
    await expect(
      getTestIneligiblePurchaseReversal(fixture.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      completed_at: expect.any(Date),
      provider_refund_id: fixture.refundId,
      receipt_amount_minor_units: '100',
    })
  })

  it('rejects a mixed membership and unrelated invoice without writing a case', async () => {
    const fixture = await setupProducer('plus')
    fixture.lines.push({
      ...fixture.lines[0]!,
      pricing: { price_details: { price: `price_unrelated_${randomUUID()}` } },
    })
    await using query = await beginTransaction()
    await expect(
      recordIneligibleStripePurchasesForWinner(fixture.options('direct', start), query),
    ).rejects.toThrow('ambiguous membership purchase lines')
    await query.rollback()
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('keeps a higher-tier Stripe purchase eligible against a family winner', async () => {
    const fixture = await setupProducer('pro')
    await using query = await beginTransaction()
    await expect(
      recordIneligibleStripePurchasesForWinner(fixture.options('family', start), query),
    ).resolves.toBe(0)
    await query.commit()
    expect(fixture.createRefund).not.toHaveBeenCalled()
    expect(fixture.cancel).not.toHaveBeenCalled()
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('does not reverse a purchase whose period ended before the collision', async () => {
    const fixture = await setupProducer('plus')
    await using query = await beginTransaction()
    await expect(
      recordIneligibleStripePurchasesForWinner(fixture.options('direct', end), query),
    ).resolves.toBe(0)
    await query.commit()
    expect(fixture.createRefund).not.toHaveBeenCalled()
    expect(fixture.cancel).not.toHaveBeenCalled()
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })
})

async function setupProducer(plan: 'plus' | 'pro') {
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
  const cancel = vi.fn<VitestLooseMock>().mockResolvedValue({})
  const createRefund = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ id: refundId, amount: 100, currency: 'usd', status: 'succeeded' })
  vi.spyOn(stripeClient, 'getStripeClient').mockReturnValue({
    invoices: {
      list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [invoice], has_more: false }),
      listLineItems: vi
        .fn<VitestLooseMock>()
        .mockImplementation(async () => ({ data: lines, has_more: false })),
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
  const lookup = {
    originatingInvoiceId: invoiceId,
    providerEnvironment: 'production' as const,
    providerApplicationId: applicationId,
  }
  return {
    lines,
    cancel,
    createRefund,
    subscriptionId,
    chargeId,
    refundId,
    lookup,
    options: (winningSourceKind: 'direct' | 'family', collision: number) => ({
      userId: user.id,
      sourceIdentity,
      winningSourceKind,
      winningPlan: 'plus' as const,
      collisionAt: new Date(collision * 1000),
    }),
  }
}
