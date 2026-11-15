import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import {
  setupStripeCollisionProducer as setupProducer,
  recordTestStripeCollisionWork as recordWork,
} from '@voucha/test-helpers/stripe-collision-producer'
import {
  getIneligiblePurchaseReversalCase,
  getIneligiblePurchaseReversalCases,
} from './case-read.mts'
import { processStripePurchaseCollisionWork } from './process-collision-work.mts'

describe('bounded immutable reversal case lookup', () => {
  afterEach(() => vi.restoreAllMocks())
  it('keeps the ambiguity signal bounded when an invoice matches several lineages', async () => {
    const scope = { applicationId: `ambiguous-${randomUUID()}`, invoiceId: `in-${randomUUID()}` }
    const firstFixture = await setupProducer('plus', false, scope)
    const firstWorkId = await recordWork(firstFixture, 'direct', 1_740_000_000)
    const firstJobId = `stripe-purchase-collision__${firstWorkId}`
    onTestFinished(async () => (await memberships.getJob(firstJobId))?.remove())
    await (await memberships.getJob(firstJobId))?.remove()
    await processStripePurchaseCollisionWork(firstWorkId)
    for (let index = 0; index < 2; index++) {
      const fixture = await setupProducer('plus', false, scope)
      const workId = await recordWork(fixture, 'direct', 1_740_000_000)
      const jobId = `stripe-purchase-collision__${workId}`
      onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
      await (await memberships.getJob(jobId))?.remove()
      await expect(processStripePurchaseCollisionWork(workId)).rejects.toThrow(
        'Stripe reversal case lookup matched more than one immutable case',
      )
    }
    const lookup = {
      providerApplicationId: scope.applicationId,
      providerEnvironment: 'production' as const,
      originatingInvoiceId: scope.invoiceId,
    }
    await expect(
      getIneligiblePurchaseReversalCases({
        providerApplicationId: lookup.providerApplicationId,
        providerEnvironment: lookup.providerEnvironment,
        originatingInvoiceIds: [scope.invoiceId],
      }),
    ).resolves.toHaveLength(2)
    await expect(getIneligiblePurchaseReversalCase(lookup)).rejects.toThrow(
      'Stripe reversal case lookup matched more than one immutable case',
    )
  })
})
