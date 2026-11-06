import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as stripeClient from '@modules/stripe/client'
import { memberships } from '@queues/memberships/queues'
import { getMembershipSourceIdByMembershipId } from '@services/memberships'
import { readTestStripePurchaseCollisionWork } from '@voucha/test-helpers/stripe-purchase-collision-work'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUnprojectedProviderObservation,
  createTestUser,
  getTestMembershipRaw,
  retireTestMembershipProviderProduct,
} from '@voucha/test-helpers'
import { processStripePurchaseCollisionWork } from './ineligible-stripe-purchase-reversal/process-collision-work.mts'
import { projectVerifiedProviderMembershipObservation } from './provider-observation-projection.mts'
import { createMembership } from './create.mts'
import { getIneligiblePurchaseReversalCase } from './ineligible-stripe-purchase-reversal/case-read.mts'

const periodStart = new Date('2025-01-01T00:00:00.000Z')
const collisionAt = new Date('2025-01-11T00:00:00.000Z')
const periodEnd = new Date('2025-01-31T00:00:00.000Z')
const membershipExpiry = new Date('2040-01-01T00:00:00.000Z')
const invoiceStart = periodStart.getTime() / 1_000
const invoiceEnd = periodEnd.getTime() / 1_000
const invoiceTotal = 1_001

describe('deferred Stripe purchase collision work', () => {
  afterEach(() => vi.restoreAllMocks())

  it('commits an Apple displacement without Stripe I/O, then creates the reversal case', async () => {
    const fixture = await createFixture()
    let ownedJobId: string | undefined
    onTestFinished(async () => {
      if (ownedJobId) await (await memberships.getJob(ownedJobId))?.remove()
    })
    const calls = createStripeCalls(fixture)
    vi.spyOn(stripeClient, 'getStripeClient').mockReturnValue(calls.client)

    const projection = await projectVerifiedProviderMembershipObservation({
      userId: fixture.userId,
      membershipProviderObservationId: fixture.apple.membershipProviderObservationId,
      sourceIdentity: fixture.apple.sourceIdentity,
    })

    expect(projection).toMatchObject({ projected: true, membershipId: expect.any(String) })
    expect(calls.invoicesList).not.toHaveBeenCalled()
    expect(calls.providerCalls.every(call => call.mock.calls.length === 0)).toBe(true)
    await expect(getTestMembershipRaw(fixture.stripeMembershipId)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
    })

    const work = await readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt)
    expect(work).toMatchObject({
      membership_provider_lineage_id: expect.any(String),
      membership_lineage_binding_id: expect.any(String),
      winning_source_kind: 'family',
      winning_plan: 'pro',
      collision_at: collisionAt,
    })
    if (!work) throw new Error('Expected committed Stripe purchase collision work')
    const jobId = `stripe-purchase-collision__${work.id}`
    ownedJobId = jobId
    const job = await memberships.getJob(jobId)
    expect(job).not.toBeNull()
    await job?.remove()

    await retireTestMembershipProviderProduct(fixture.stripeSku.membership_provider_product_id)
    calls.invoicesList.mockResolvedValue({ data: [fixture.invoice], has_more: false })
    calls.invoiceLines.mockResolvedValue({ data: fixture.lines, has_more: false })
    await processStripePurchaseCollisionWork(work.id)

    const reversalCase = await getIneligiblePurchaseReversalCase({
      originatingInvoiceId: fixture.invoice.id,
      providerApplicationId: fixture.applicationId,
      providerEnvironment: 'production',
    })
    expect(reversalCase).toMatchObject({
      originatingInvoiceId: fixture.invoice.id,
      winningSourceKind: 'family',
      collisionAt,
      refundCapMinorUnits: Math.floor(
        (invoiceTotal * (periodEnd.getTime() - collisionAt.getTime())) /
          (periodEnd.getTime() - periodStart.getTime()),
      ),
    })
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toBeNull()
    await expect(processStripePurchaseCollisionWork(work.id)).resolves.toBeUndefined()
    expect(calls.invoicesList).toHaveBeenCalledTimes(2)
  })

  it('keeps committed work after a Stripe outage so recovery can retry it', async () => {
    const fixture = await createFixture()
    let ownedJobId: string | undefined
    onTestFinished(async () => {
      if (ownedJobId) await (await memberships.getJob(ownedJobId))?.remove()
    })
    const providerError = new Error('temporary Stripe outage')
    const calls = createStripeCalls(fixture)
    calls.invoicesList.mockRejectedValue(providerError)
    vi.spyOn(stripeClient, 'getStripeClient').mockReturnValue(calls.client)

    await expect(
      projectVerifiedProviderMembershipObservation({
        userId: fixture.userId,
        membershipProviderObservationId: fixture.apple.membershipProviderObservationId,
        sourceIdentity: fixture.apple.sourceIdentity,
      }),
    ).resolves.toMatchObject({ projected: true })
    expect(calls.invoicesList).not.toHaveBeenCalled()

    const work = await readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt)
    if (!work) throw new Error('Expected committed Stripe purchase collision work')
    ownedJobId = `stripe-purchase-collision__${work.id}`
    const job = await memberships.getJob(ownedJobId)
    expect(job).not.toBeNull()
    await job?.remove()

    await expect(processStripePurchaseCollisionWork(work.id)).rejects.toBe(providerError)
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toMatchObject({ id: work.id })

    calls.invoicesList.mockResolvedValue({ data: [fixture.invoice], has_more: false })
    calls.invoiceLines.mockResolvedValue({ data: fixture.lines, has_more: false })
    await processStripePurchaseCollisionWork(work.id)
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toBeNull()
    await expect(
      getIneligiblePurchaseReversalCase({
        originatingInvoiceId: fixture.invoice.id,
        providerApplicationId: fixture.applicationId,
        providerEnvironment: 'production',
      }),
    ).resolves.toMatchObject({ collisionAt, winningSourceKind: 'family' })
    expect(calls.invoicesList).toHaveBeenCalledTimes(3)
  })
})

async function createFixture() {
  const user = await createTestUser()
  const applicationId = `deferred_collision_${randomUUID()}`
  const subscriptionId = `sub_deferred_collision_${randomUUID()}`
  const stripeSku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
  const stripeMembership = await createMembership({
    userId: user.id,
    plan: 'plus',
    skuId: stripeSku.id,
    providerApplicationId: applicationId,
    providerEnvironment: 'production',
    stripeSubscriptionId: subscriptionId,
    effectiveAt: periodStart,
    expiresAt: membershipExpiry,
  })
  const sourceId = await getMembershipSourceIdByMembershipId(stripeMembership.id)
  if (!sourceId) throw new Error('Expected Stripe membership source id')
  const appleSku = await createTestSku({ plan: 'pro' })
  const appleApplicationId = `apple_deferred_collision_${randomUUID()}`
  const appleProduct = await createTestNativeMembershipProviderProduct({
    membershipProductId: appleSku.id,
    provider: 'apple_app_store',
    environment: 'test',
    applicationId: appleApplicationId,
    providerProductId: `apple-product-${randomUUID()}`,
  })
  const apple = await createTestUnprojectedProviderObservation({
    applicationId: appleApplicationId,
    environment: 'test',
    expiresAt: membershipExpiry,
    membershipProductId: appleSku.id,
    membershipProviderProductId: appleProduct.id,
    provider: 'apple_app_store',
    providerLineageId: `original-transaction-${randomUUID()}`,
    sourceKind: 'family',
    effectiveAt: collisionAt,
    userId: user.id,
  })
  const invoice = {
    id: `in_deferred_collision_${randomUUID()}`,
    status: 'paid',
    total: invoiceTotal,
    currency: 'usd',
    created: invoiceStart,
    payments: {
      has_more: false,
      data: [
        {
          status: 'paid',
          amount_paid: invoiceTotal,
          payment: { type: 'charge', charge: `ch_deferred_collision_${randomUUID()}` },
        },
      ],
    },
  }
  const lines = [
    {
      id: `il_deferred_collision_${randomUUID()}`,
      currency: 'usd',
      pricing: { price_details: { price: stripeSku.stripe_price_id } },
      period: { start: invoiceStart, end: invoiceEnd },
    },
  ]
  return {
    userId: user.id,
    stripeMembershipId: stripeMembership.id,
    subscriptionId,
    applicationId,
    sourceId,
    stripeSku,
    apple,
    invoice,
    lines,
  }
}

function createStripeCalls(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const invoicesList = vi
    .fn<VitestLooseMock>()
    .mockRejectedValue(new Error('Stripe invoice listing ran before projection commit'))
  const invoiceLines = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ data: fixture.lines, has_more: false })
  const refundsList = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false })
  const refundCreate = vi.fn<VitestLooseMock>().mockImplementation(async options => ({
    id: `re_deferred_collision_${randomUUID()}`,
    amount: options.amount,
    currency: 'usd',
    status: 'succeeded',
  }))
  const disputesList = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false })
  const subscriptionCancel = vi.fn<VitestLooseMock>().mockResolvedValue({})
  const client = {
    invoices: { list: invoicesList, listLineItems: invoiceLines },
    refunds: { list: refundsList, create: refundCreate },
    disputes: { list: disputesList },
    subscriptions: { cancel: subscriptionCancel },
  } as unknown as ReturnType<typeof stripeClient.getStripeClient>
  return {
    client,
    invoicesList,
    invoiceLines,
    providerCalls: [
      invoicesList,
      invoiceLines,
      refundsList,
      refundCreate,
      disputesList,
      subscriptionCancel,
    ],
  }
}
