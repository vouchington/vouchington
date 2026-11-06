import { enqueueRecoverStripePurchaseCollisions } from '@queues/memberships/enqueues'
import { processMembershipJob } from '../../../workers/memberships/processors/process-job.mts'
import type { Job } from 'glide-mq'
import type { RecoverStripePurchaseCollisionsData } from '@queues/memberships/types'
import { recoverStripePurchaseCollisions } from '../../../workers/memberships/processors/stripe-purchase-collisions.mts'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as stripeClient from '@modules/stripe/client'
import { memberships } from '@queues/memberships/queues'
import {
  beginTransaction,
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { getMembershipSourceIdByMembershipId } from '@services/memberships'
import { readTestStripePurchaseCollisionWork } from '@voucha/test-helpers/stripe-purchase-collision-work'
import { getStripeMembershipSourceIdentity } from '../create-types.mts'
import { getIneligiblePurchaseReversalCase } from './case-read.mts'
import { recordIneligibleStripePurchaseCollisionWork } from './collision-work.mts'
import { processStripePurchaseCollisionWork } from './process-collision-work.mts'

const start = 1_740_000_000
const end = start + 100
const collisionAt = new Date(start * 1_000)

describe('durable ineligible Stripe purchase case producer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('processes committed collision work and creates its reversal case', async () => {
    const fixture = await setupProducer('plus')
    const workId = await recordWork(fixture, 'direct', start)
    const jobId = `stripe-purchase-collision__${workId}`
    onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
    const job = await memberships.getJob(jobId)
    expect(job).not.toBeNull()
    await job?.remove()

    await processStripePurchaseCollisionWork(workId)

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

  it('retains committed work when Stripe invoice listing fails', async () => {
    const fixture = await setupProducer('plus')
    const providerError = new Error('temporary Stripe outage')
    fixture.invoicesList.mockRejectedValue(providerError)
    const workId = await recordWork(fixture, 'direct', start)
    const jobId = `stripe-purchase-collision__${workId}`
    onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
    const job = await memberships.getJob(jobId)
    expect(job).not.toBeNull()
    await job?.remove()

    await expect(processStripePurchaseCollisionWork(workId)).rejects.toBe(providerError)
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toMatchObject({ id: workId })
  })

  it('completes work without a case when a higher-tier purchase remains eligible', async () => {
    const fixture = await setupProducer('pro')
    const workId = await recordWork(fixture, 'family', start)
    const jobId = `stripe-purchase-collision__${workId}`
    onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
    await (await memberships.getJob(jobId))?.remove()

    await processStripePurchaseCollisionWork(workId)

    expect(fixture.createRefund).not.toHaveBeenCalled()
    expect(fixture.cancel).not.toHaveBeenCalled()
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toBeNull()
  })

  it('completes work without a case when the purchase period ended before collision', async () => {
    const fixture = await setupProducer('plus')
    const workId = await recordWork(fixture, 'direct', end)
    const jobId = `stripe-purchase-collision__${workId}`
    onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
    await (await memberships.getJob(jobId))?.remove()

    await processStripePurchaseCollisionWork(workId)

    expect(fixture.createRefund).not.toHaveBeenCalled()
    expect(fixture.cancel).not.toHaveBeenCalled()
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, new Date(end * 1_000)),
    ).resolves.toBeNull()
  })
  it('retries after case commit without duplicating the financial outcome', async () => {
    const fixture = await setupProducer('plus')
    const workId = await recordWork(fixture, 'direct', start)
    const jobId = `stripe-purchase-collision__${workId}`
    onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
    await (await memberships.getJob(jobId))?.remove()
    const outage = new Error('cancellation unavailable after case commit')
    fixture.cancel.mockRejectedValueOnce(outage)
    await expect(processStripePurchaseCollisionWork(workId)).rejects.toBe(outage)
    const committed = await getIneligiblePurchaseReversalCase(fixture.lookup)
    expect(committed).toMatchObject({ refundCapMinorUnits: 100 })
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toMatchObject({ id: workId })
    await processStripePurchaseCollisionWork(workId)
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toEqual(committed)
    expect(fixture.createRefund).toHaveBeenCalledTimes(1)
  })

  it('recovers lost admission and deduplicates replay from durable work', async () => {
    const fixture = await setupProducer('plus')
    const workId = await recordWork(fixture, 'direct', start)
    expect(await recordWork(fixture, 'direct', start)).toBe(workId)
    const taskId = `stripe-purchase-collision__${workId}`
    const pages: string[] = []
    // A predecessor confines the recovery page to this test-owned immutable UUID.
    const hex = (BigInt(`0x${workId.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
    const after = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    onTestFinished(async () => {
      for (const id of [...pages, taskId]) await (await memberships.getJob(id))?.remove()
    })
    const upperPage = await enqueueRecoverStripePurchaseCollisions(
      { after: 'ffffffff-ffff-7fff-bfff-ffffffffffff' },
      {
        jobId: `test-collision-upper-${randomUUID()}`,
        deduplication: { id: randomUUID(), mode: 'simple' },
      },
    )
    if (!upperPage) throw new Error('Expected bounded recovery task')
    pages.push(upperPage.id)
    await processMembershipJob(upperPage)
    await expect(memberships.getJob(upperPage.id)).resolves.toMatchObject({
      data: { through: expect.any(String), dispatchReceipt: { result: { enqueued: 0 } } },
    })
    const sweep = async () => {
      const job = await memberships.add(
        'recoverStripePurchaseCollisions',
        { after, through: workId },
        {
          jobId: `test-collision-recovery-${randomUUID()}`,
        },
      )
      if (!job) throw new Error('Expected recovery job')
      pages.push(job.id)
      return recoverStripePurchaseCollisions(job as Job<RecoverStripePurchaseCollisionsData>)
    }
    await (await memberships.getJob(taskId))?.remove()
    await expect(sweep()).resolves.toEqual({ enqueued: 1 })
    await Promise.all([sweep(), sweep()])
    await expect(memberships.getJob(taskId)).resolves.toMatchObject({
      name: 'processStripePurchaseCollisionWork',
      data: { workId },
      opts: { removeOnComplete: true, removeOnFail: true },
    })
    await (await memberships.getJob(taskId))?.remove()
    await processStripePurchaseCollisionWork(workId)
    await expect(sweep()).resolves.toEqual({ enqueued: 0 })
    await expect(memberships.getJob(taskId)).resolves.toBeNull()
    expect(fixture.createRefund).toHaveBeenCalledTimes(1)
  })
})

async function recordWork(
  fixture: Awaited<ReturnType<typeof setupProducer>>,
  winningSourceKind: 'direct' | 'family',
  collision: number,
): Promise<string> {
  await using query = await beginTransaction()
  const workId = await recordIneligibleStripePurchaseCollisionWork(
    {
      userId: fixture.userId,
      sourceIdentity: fixture.sourceIdentity,
      winningSourceKind,
      winningPlan: 'plus',
      collisionAt: new Date(collision * 1_000),
    },
    query,
  )
  if (!workId) throw new Error('Expected Stripe purchase collision work')
  await query.commit()
  return workId
}

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
  const cancel = vi.fn<VitestLooseMock>().mockResolvedValue({})
  const createRefund = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ id: refundId, amount: 100, currency: 'usd', status: 'succeeded' })
  const invoicesList = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ data: [invoice], has_more: false })
  vi.spyOn(stripeClient, 'getStripeClient').mockReturnValue({
    invoices: {
      list: invoicesList,
      listLineItems: vi.fn<VitestLooseMock>().mockResolvedValue({ data: lines, has_more: false }),
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
    cancel,
    createRefund,
    invoicesList,
    subscriptionId,
    chargeId,
    refundId,
    lookup,
  }
}
