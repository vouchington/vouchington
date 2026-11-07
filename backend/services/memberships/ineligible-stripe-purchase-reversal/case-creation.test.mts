import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { StripeInvoiceWithAllPayments } from '@modules/stripe/invoices'
import {
  beginTransaction,
  createTestUser,
  getTestIneligiblePurchaseReversalCase,
} from '@voucha/test-helpers'
import {
  calculateIneligibleStripePurchaseRefundCap,
  recordIneligibleStripePurchaseCasesForCollision,
  type IneligibleStripePurchaseCaseInput,
} from './case-creation.mts'

describe('ineligible Stripe purchase refund cap', () => {
  const start = new Date('2026-01-01T00:00:00.000Z')
  const end = new Date('2026-01-01T00:00:10.000Z')

  it.each([
    ['already covered', new Date('2025-12-31T23:59:59.000Z'), 1001],
    ['covered at the start', start, 1001],
    ['partial overlap rounded down', new Date('2026-01-01T00:00:03.000Z'), 700],
    ['no overlap at the end', end, 0],
    ['no overlap after the end', new Date('2026-01-01T00:00:11.000Z'), 0],
  ])('%s', (_label, collision, expected) => {
    expect(calculateIneligibleStripePurchaseRefundCap(1001, start, end, collision)).toBe(expected)
  })

  it('uses the full qualifying amount for a zero-length period', () => {
    expect(calculateIneligibleStripePurchaseRefundCap(1001, start, start, start)).toBe(1001)
  })

  it('preserves integer precision for large minor-unit amounts', () => {
    expect(
      calculateIneligibleStripePurchaseRefundCap(
        Number.MAX_SAFE_INTEGER,
        start,
        end,
        new Date('2026-01-01T00:00:03.000Z'),
      ),
    ).toBe(6305039478318693)
  })

  it.each([Number.MAX_SAFE_INTEGER + 1, -1, 1.5])(
    'rejects invalid qualifying minor units %s',
    amount => {
      expect(() => calculateIneligibleStripePurchaseRefundCap(amount, start, end, start)).toThrow(
        'Stripe purchase qualifying amount must be a nonnegative safe integer',
      )
    },
  )
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
    await expect(
      recordIneligibleStripePurchaseCasesForCollision([input], transaction),
    ).resolves.toEqual([])
    await transaction.commit()
    await expect(
      getTestIneligiblePurchaseReversalCase(subscriptionId, 'production'),
    ).resolves.toBeNull()
  })

  it('rejects a batch whose purchases have different source identities', async () => {
    const { input, subscriptionId } = await createCaseInput()
    const other = {
      ...input,
      sourceIdentity: { ...input.sourceIdentity, providerLineageId: `sub_other_${randomUUID()}` },
      invoice: { ...input.invoice, id: `in_other_${randomUUID()}` },
    }
    await using transaction = await beginTransaction()
    await expect(
      recordIneligibleStripePurchaseCasesForCollision([input, other], transaction),
    ).rejects.toThrow('Stripe reversal case batch must share one source identity')
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
    await expect(
      recordIneligibleStripePurchaseCasesForCollision([fixture.input], transaction),
    ).rejects.toThrow(error)
    await transaction.commit()
    await expect(
      getTestIneligiblePurchaseReversalCase(fixture.subscriptionId, 'production'),
    ).resolves.toBeNull()
  })
})
