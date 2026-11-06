import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { StripeInvoiceWithAllPayments } from '@modules/stripe/invoices'
import {
  beginTransaction,
  createTestUser,
  getTestIneligiblePurchaseReversalCase,
} from '@voucha/test-helpers'
import {
  recordIneligibleStripePurchaseCaseForCollision,
  recordPreparedIneligibleStripePurchaseCasesForCollision,
  type IneligibleStripePurchaseCaseInput,
} from './case-creation.mts'

import { createProviderMembershipSource } from '../provider-source.mts'
import { getLockedIneligiblePurchaseReversalCase } from './case-ledger.mts'

describe('ineligible Stripe purchase refund cap', () => {
  const start = new Date('2026-01-01T00:00:00.000Z')
  const end = new Date('2026-01-01T00:00:10.000Z')

  it.each([
    ['already covered', start, end, new Date('2025-12-31T23:59:59.000Z'), 1001, 1001],
    ['covered at the start', start, end, start, 1001, 1001],
    ['partial overlap rounded down', start, end, new Date('2026-01-01T00:00:03.000Z'), 1001, 700],
    ['zero-length period', start, start, start, 1001, 1001],
    [
      'large minor-unit amount',
      start,
      end,
      new Date('2026-01-01T00:00:03.000Z'),
      Number.MAX_SAFE_INTEGER,
      6305039478318693,
    ],
  ])('%s', async (_label, periodStart, periodEnd, collision, amount, expected) => {
    const { input, invoice, line, subscriptionId } = await createCaseInput()
    line.period = { start: periodStart.getTime() / 1000, end: periodEnd.getTime() / 1000 }
    invoice.total = amount
    input.collisionAt = collision
    await using transaction = await beginTransaction()
    await expect(recordIneligibleStripePurchaseCaseForCollision(input, transaction)).resolves.toBe(
      true,
    )
    const recorded = await getLockedIneligiblePurchaseReversalCase(
      {
        originatingInvoiceId: invoice.id,
        providerApplicationId: input.sourceIdentity.applicationId,
        providerEnvironment: 'production',
        subscriptionId,
      },
      transaction,
    )
    expect(recorded?.refundCapMinorUnits).toBe(expected)
    await expect(recordIneligibleStripePurchaseCaseForCollision(input, transaction)).resolves.toBe(
      false,
    )
  })

  it.each([Number.MAX_SAFE_INTEGER + 1, -1, 1.5])(
    'rejects invalid qualifying minor units %s through the producer',
    async amount => {
      const { input, invoice } = await createCaseInput()
      invoice.total = amount
      await using transaction = await beginTransaction()
      await expect(
        recordIneligibleStripePurchaseCaseForCollision(input, transaction),
      ).rejects.toThrow(`Stripe invoice ${invoice.id} has an invalid qualifying amount`)
      await transaction.commit()
    },
  )

  it('rejects an inverted service period through the producer', async () => {
    const { input, line } = await createCaseInput()
    line.period = { start: end.getTime() / 1000, end: start.getTime() / 1000 }
    input.collisionAt = start
    await using transaction = await beginTransaction()
    await expect(
      recordIneligibleStripePurchaseCaseForCollision(input, transaction),
    ).rejects.toThrow('Stripe purchase period ends before it starts')
    await transaction.commit()
  })
})

async function createCaseInput() {
  const user = await createTestUser()
  const subscriptionId = `sub_invalid_reversal_${randomUUID()}`
  const customerId = `cus_invalid_reversal_${randomUUID()}`
  const priceId = `price_invalid_reversal_${randomUUID()}`
  const line = {
    currency: 'usd',
    period: { start: 1_740_000_000, end: 1_740_000_100 },
    pricing: { price_details: { price: priceId } },
  }
  const invoice = {
    id: `in_invalid_reversal_${randomUUID()}`,
    customer: customerId,
    currency: 'usd',
    total: 100,
    lines: { data: [line] },
  }
  const input: IneligibleStripePurchaseCaseInput = {
    userId: user.id,
    sourceIdentity: {
      provider: 'stripe',
      environment: 'production',
      applicationId: `invalid-reversal-${randomUUID()}`,
      providerLineageId: subscriptionId,
      providerAccountId: customerId,
    },
    invoice: invoice as unknown as StripeInvoiceWithAllPayments,
    stripePriceId: priceId,
    winningSourceKind: 'family',
    collisionAt: new Date(1_740_000_050_000),
  }
  return { input, invoice, line, subscriptionId }
}

describe('ineligible Stripe purchase case validation', () => {
  it.each([
    ['ended service period', 1_740_000_000, 1_740_000_025],
    ['zero-length service point before the winner', 1_740_000_025, 1_740_000_025],
  ])('skips a nonoverlapping %s', async (_label, startedAt, endedAt) => {
    const { input, line, subscriptionId } = await createCaseInput()
    line.period = { start: startedAt, end: endedAt }
    await using transaction = await beginTransaction()
    await expect(recordIneligibleStripePurchaseCaseForCollision(input, transaction)).resolves.toBe(
      false,
    )
    const source = await createProviderMembershipSource(
      { userId: input.userId, sourceIdentity: input.sourceIdentity, sourceKind: 'direct' },
      transaction,
    )
    await expect(
      recordPreparedIneligibleStripePurchaseCasesForCollision([input], source, transaction),
    ).resolves.toEqual([])
    await transaction.commit()
    await expect(
      getTestIneligiblePurchaseReversalCase(subscriptionId, 'production'),
    ).resolves.toBeNull()
  })

  it.each([
    {
      label: 'invoice customer mismatch',
      mutate: ({ invoice }: Awaited<ReturnType<typeof createCaseInput>>) => {
        invoice.customer = `cus_other_${randomUUID()}`
      },
      error: /customer does not match its subscription/,
    },
    {
      label: 'multiple purchase lines',
      mutate: ({ invoice, line }: Awaited<ReturnType<typeof createCaseInput>>) => {
        invoice.lines.data.push({ ...line })
      },
      error: /must have exactly one membership purchase line/,
    },
    {
      label: 'price mismatch',
      mutate: ({ line }: Awaited<ReturnType<typeof createCaseInput>>) => {
        line.pricing.price_details.price = `price_other_${randomUUID()}`
      },
      error: /does not match the membership purchase price/,
    },
    {
      label: 'currency mismatch',
      mutate: ({ line }: Awaited<ReturnType<typeof createCaseInput>>) => {
        line.currency = 'eur'
      },
      error: /does not match the membership purchase price/,
    },
    {
      label: 'invalid qualifying amount',
      mutate: ({ invoice }: Awaited<ReturnType<typeof createCaseInput>>) => {
        invoice.total = Number.MAX_SAFE_INTEGER + 1
      },
      error: /has an invalid qualifying amount/,
    },
  ])('does not persist a case for $label', async ({ mutate, error }) => {
    const fixture = await createCaseInput()
    mutate(fixture)
    await using transaction = await beginTransaction()
    const source = await createProviderMembershipSource(
      {
        userId: fixture.input.userId,
        sourceIdentity: fixture.input.sourceIdentity,
        sourceKind: 'direct',
      },
      transaction,
    )
    await expect(
      recordPreparedIneligibleStripePurchaseCasesForCollision([fixture.input], source, transaction),
    ).rejects.toThrow(error)
    await transaction.commit()
    await expect(
      getTestIneligiblePurchaseReversalCase(fixture.subscriptionId, 'production'),
    ).resolves.toBeNull()
  })
})
