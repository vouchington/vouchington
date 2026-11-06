import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { detectIneligibleStripePurchaseFromInvoicePayment } from './detect-ineligible-purchase.mts'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { beginTransaction } from '@voucha/test-helpers'
import { readTestStripePurchaseCollisionWork } from '@voucha/test-helpers/stripe-purchase-collision-work'
import { setupPurchase } from '@voucha/test-helpers/stripe-reversal-detection'
import * as stripeClient from '@modules/stripe/client'
import { getIneligiblePurchaseReversalCase } from '@services/memberships/ineligible-stripe-purchase-reversal/case-read'
import {
  completeStripePurchaseCollisionWork,
  recordIneligibleStripePurchaseCollisionWork,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-work'
import { processStripePurchaseCollisionWork } from '@services/memberships/ineligible-stripe-purchase-reversal/process-collision-work'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'

const start = 1_740_000_000
const end = start + 100

describe('detector uses the earliest qualifying pending collision', () => {
  beforeEach(() => vi.setSystemTime(new Date((start + 50) * 1_000)))
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)(
    'uses pending collision snapshot; unknown account: %s, concurrent completion: %s',
    async (unknownProviderAccount, concurrentCompletion) => {
      const fixture = await setupPurchase(start + 50, end, 'family', 'pro')
      const sourceIdentity = getStripeMembershipSourceIdentity({
        stripeSubscriptionId: fixture.subscriptionId,
        providerApplicationId: fixture.lookup.providerApplicationId,
        stripeCustomerId: unknownProviderAccount ? undefined : fixture.subscription.customer,
      })
      const workIds: string[] = []
      const workTimes = [
        { collisionAt: new Date(start * 1_000), winningPlan: 'plus' as const },
        { collisionAt: new Date((start + 10) * 1_000), winningPlan: 'pro' as const },
      ]
      await using query = await beginTransaction()
      const source = await createProviderMembershipSource(
        { userId: fixture.userId, sourceKind: 'direct', sourceIdentity },
        query,
      )
      for (const work of workTimes) {
        const id = await recordIneligibleStripePurchaseCollisionWork(
          {
            userId: fixture.userId,
            sourceIdentity,
            winningSourceKind: 'family',
            winningPlan: work.winningPlan,
            collisionAt: work.collisionAt,
          },
          query,
        )
        if (!id) throw new Error('Expected durable Stripe collision work')
        workIds.push(id)
      }
      await query.commit()

      onTestFinished(async () => {
        for (const id of workIds) {
          await (await memberships.getJob(`stripe-purchase-collision__${id}`))?.remove()
          await completeStripePurchaseCollisionWork(id)
        }
      })

      const sourceId = source.id
      await expect(
        readTestStripePurchaseCollisionWork(sourceId, new Date((start + 10) * 1_000)),
      ).resolves.toMatchObject({ winning_source_kind: 'family', winning_plan: 'pro' })

      const invoicesList = vi.mocked(stripeClient.getStripeClient().invoices.list)

      const restore = concurrentCompletion
        ? afterPostgresTransactionQueryForTest(
            'getExistingCapturedStripeSource',
            values => values.includes(fixture.userId),
            async () => {
              await Promise.all(workIds.map(id => completeStripePurchaseCollisionWork(id)))
            },
          )
        : () => {}
      onTestFinished(restore)
      await expect(fixture.detect()).resolves.toBe(true)
      restore()
      await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toMatchObject({
        winningSourceKind: 'family',
        collisionAt: new Date((start + 10) * 1_000),
        refundCapMinorUnits: Math.floor((1001 * 90) / 100),
      })

      if (!concurrentCompletion)
        for (const id of workIds) {
          invoicesList.mockResolvedValueOnce({ data: [], has_more: false } as never)
          await processStripePurchaseCollisionWork(id)
        }
      fixture.lines[0]!.period = { start: end + 100, end: end + 200 }
      const laterInvoiceId = fixture.addInvoice()
      await expect(
        detectIneligibleStripePurchaseFromInvoicePayment(laterInvoiceId, 'production', {
          applicationId: fixture.lookup.providerApplicationId,
        }),
      ).resolves.toBe(false)
      await expect(
        getIneligiblePurchaseReversalCase({
          ...fixture.lookup,
          originatingInvoiceId: laterInvoiceId,
        }),
      ).resolves.toBeNull()

      await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toMatchObject({
        collisionAt: new Date((start + 10) * 1_000),
        refundCapMinorUnits: 900,
      })
    },
  )
})
