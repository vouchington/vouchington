import { setupStripeCollisionProducer } from '@voucha/test-helpers/stripe-collision-producer'
import { beginTransaction } from '@voucha/test-helpers'
import {
  readTestStripePurchaseCollisionReview,
  readTestStripePurchaseCollisionWork,
} from '@voucha/test-helpers/stripe-purchase-collision-work'
import { memberships } from '@queues/memberships/queues'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { recordIneligibleStripePurchaseCollisionWork } from './collision-work.mts'
import { processStripePurchaseCollisionWork } from './process-collision-work.mts'

const laterAt = new Date(1_740_000_000_000)
const earlierAt = new Date(laterAt.getTime() - 10 * 86_400_000)

describe('Stripe collision review evidence', () => {
  afterEach(() => vi.restoreAllMocks())

  it('records the earliest qualifying collision even when later work runs first', async () => {
    const fixture = await setupStripeCollisionProducer('plus', true)
    fixture.oldLines.forEach((line, index) => {
      line.id = `${fixture.oldInvoice.id}_${index}`
      line.period = {
        start: Math.floor(laterAt.getTime() / 1_000) - 20 * 86_400,
        end: Math.floor(laterAt.getTime() / 1_000) - 5 * 86_400,
      }
    })
    fixture.invoicesList.mockResolvedValue({ data: [fixture.oldInvoice], has_more: false })
    const earlierWorkId = await recordWork(fixture, 'family', 'pro', earlierAt)
    const laterWorkId = await recordWork(fixture, 'direct', 'plus', laterAt)
    for (const workId of [earlierWorkId, laterWorkId]) {
      const jobId = `stripe-purchase-collision__${workId}`
      onTestFinished(async () => (await memberships.getJob(jobId))?.remove())
      await (await memberships.getJob(jobId))?.remove()
    }

    await processStripePurchaseCollisionWork(laterWorkId)
    const review = await readTestStripePurchaseCollisionReview(
      fixture.sourceId,
      fixture.oldInvoice.id,
    )
    expect(review).toMatchObject({
      membership_source_id: fixture.sourceId,
      originating_invoice_id: fixture.oldInvoice.id,
      winning_source_kind: 'family',
      winning_plan: 'pro',
      collision_at: earlierAt,
      invoice_line_count: 2,
      mapped_membership_line_count: 2,
    })
    await expect(readTestStripePurchaseCollisionWork(fixture.sourceId, laterAt)).resolves.toBeNull()

    await processStripePurchaseCollisionWork(earlierWorkId)
    await expect(
      readTestStripePurchaseCollisionReview(fixture.sourceId, fixture.oldInvoice.id),
    ).resolves.toEqual(review)
    await expect(
      readTestStripePurchaseCollisionWork(fixture.sourceId, earlierAt),
    ).resolves.toBeNull()
    expect(fixture.createRefund).not.toHaveBeenCalled()
    expect(fixture.cancel).not.toHaveBeenCalled()
  })
})

async function recordWork(
  fixture: Awaited<ReturnType<typeof setupStripeCollisionProducer>>,
  winningSourceKind: 'direct' | 'family',
  winningPlan: 'plus' | 'pro',
  collisionAt: Date,
): Promise<string> {
  await using query = await beginTransaction()
  const workId = await recordIneligibleStripePurchaseCollisionWork(
    {
      userId: fixture.userId,
      sourceIdentity: fixture.sourceIdentity,
      winningSourceKind,
      winningPlan,
      collisionAt,
    },
    query,
  )
  if (!workId) throw new Error('Expected Stripe purchase collision work')
  await query.commit()
  return workId
}
