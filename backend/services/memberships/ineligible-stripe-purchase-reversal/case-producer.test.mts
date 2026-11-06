import { setupStripeCollisionProducer as setupProducer } from '@voucha/test-helpers/stripe-collision-producer'
import { enqueueRecoverStripePurchaseCollisions } from '@queues/memberships/enqueues'
import { processMembershipJob } from '../../../workers/memberships/processors/process-job.mts'
import type { Job } from 'glide-mq'
import type { RecoverStripePurchaseCollisionsData } from '@queues/memberships/types'
import { recoverStripePurchaseCollisions } from '../../../workers/memberships/processors/stripe-purchase-collisions.mts'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { beginTransaction, getTestIneligiblePurchaseReversal } from '@voucha/test-helpers'
import {
  readTestStripePurchaseCollisionReview,
  readTestStripePurchaseCollisionWork,
} from '@voucha/test-helpers/stripe-purchase-collision-work'
import { getIneligiblePurchaseReversalCase } from './case-read.mts'
import {
  recordIneligibleStripePurchaseCollisionWork,
  completeStripePurchaseCollisionWork,
} from './collision-work.mts'
import { processStripePurchaseCollisionWork } from './process-collision-work.mts'

const start = 1_740_000_000
const end = start + 100
const collisionAt = new Date(start * 1_000)

describe('durable ineligible Stripe purchase case producer', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    [false, false],
    [true, false],
    [false, true],
  ] as const)(
    'processes history: %s, concurrent completion during listing: %s',
    async (history, concurrentCompletion) => {
      const fixture = await setupProducer('plus', history)
      const workId = await recordWork(fixture, 'direct', start)
      const jobId = `stripe-purchase-collision__${workId}`
      onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
      const job = await memberships.getJob(jobId)
      expect(job).not.toBeNull()
      await job?.remove()

      if (concurrentCompletion)
        fixture.invoicesList.mockImplementationOnce(async () => {
          await completeStripePurchaseCollisionWork(workId)
          return { data: [fixture.invoice], has_more: false }
        })
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
    },
  )

  it('reconciles valid siblings and records ambiguous invoices once for staff review', async () => {
    const fixture = await setupProducer('plus', true)
    makeOldInvoiceAmbiguous(fixture)
    const workId = await recordWork(fixture, 'direct', start)
    const jobId = `stripe-purchase-collision__${workId}`
    onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
    await (await memberships.getJob(jobId))?.remove()
    await processStripePurchaseCollisionWork(workId)
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toMatchObject({
      refundCapMinorUnits: 100,
    })
    await expect(
      getIneligiblePurchaseReversalCase({
        ...fixture.lookup,
        originatingInvoiceId: fixture.oldInvoice.id,
      }),
    ).resolves.toBeNull()
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toBeNull()
    await expect(
      readTestStripePurchaseCollisionReview(fixture.sourceId, fixture.oldInvoice.id),
    ).resolves.toMatchObject({
      membership_source_id: fixture.sourceId,
      originating_invoice_id: fixture.oldInvoice.id,
      winning_source_kind: 'direct',
      winning_plan: 'plus',
      collision_at: collisionAt,
      invoice_line_count: 2,
      mapped_membership_line_count: 2,
    })
    expect(fixture.createRefund).toHaveBeenCalledTimes(1)
    await processStripePurchaseCollisionWork(workId)
    expect(fixture.createRefund).toHaveBeenCalledTimes(1)
    expect(fixture.invoicesList).toHaveBeenCalledTimes(2)
  })

  it('completes ambiguous-only work with one invoice listing across two calls', async () => {
    const fixture = await setupProducer('plus', true)
    makeOldInvoiceAmbiguous(fixture)
    fixture.invoicesList.mockResolvedValue({ data: [fixture.oldInvoice], has_more: false })
    const workId = await recordWork(fixture, 'direct', start)
    const jobId = `stripe-purchase-collision__${workId}`
    onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
    await (await memberships.getJob(jobId))?.remove()

    await processStripePurchaseCollisionWork(workId)
    await expect(
      readTestStripePurchaseCollisionReview(fixture.sourceId, fixture.oldInvoice.id),
    ).resolves.toMatchObject({
      membership_source_id: fixture.sourceId,
      originating_invoice_id: fixture.oldInvoice.id,
      invoice_line_count: 2,
      mapped_membership_line_count: 2,
    })
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, collisionAt),
    ).resolves.toBeNull()
    await expect(
      getIneligiblePurchaseReversalCase({
        ...fixture.lookup,
        originatingInvoiceId: fixture.oldInvoice.id,
      }),
    ).resolves.toBeNull()
    await processStripePurchaseCollisionWork(workId)
    expect(fixture.invoicesList).toHaveBeenCalledTimes(1)
    expect(fixture.createRefund).not.toHaveBeenCalled()
    expect(fixture.cancel).not.toHaveBeenCalled()
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

function makeOldInvoiceAmbiguous(fixture: Awaited<ReturnType<typeof setupProducer>>): void {
  fixture.oldLines.forEach((line, index) => {
    line.id = `${fixture.oldInvoice.id}_${index}`
    line.period = { start, end }
  })
}
