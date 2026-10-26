import { describe, expect, it } from 'vitest'
import { allocateReversalCaseTargets } from './case-allocation.mts'
import { createIneligiblePurchaseReversalIdempotencyKey } from '../ineligible-stripe-purchase-reversal-idempotency.mts'

const reversalCase = {
  currency: 'usd',
  providerApplicationId: 'voucha-web',
  providerEnvironment: 'production' as const,
  refundCapMinorUnits: 500,
  subscriptionId: 'sub_case',
}

describe('allocateReversalCaseTargets immutable cap', () => {
  it('allocates only the immutable cap across later payment targets', () => {
    const first = target('ch_first', 300)
    const firstKey = createIneligiblePurchaseReversalIdempotencyKey(
      reversalCase.providerEnvironment,
      reversalCase.providerApplicationId,
      reversalCase.subscriptionId,
      first,
    )

    expect(
      allocateReversalCaseTargets(
        reversalCase,
        [first, target('ch_later', 700)],
        new Map([[firstKey, 300]]),
      ),
    ).toEqual([
      expect.objectContaining({ chargeId: 'ch_first', qualifyingAmountMinorUnits: 300 }),
      expect.objectContaining({ chargeId: 'ch_later', qualifyingAmountMinorUnits: 200 }),
    ])
  })

  it('does not increase the stored allocation when a later invoice read grows', () => {
    expect(
      allocateReversalCaseTargets(reversalCase, [target('ch_later', 1_000)], new Map()),
    ).toEqual([expect.objectContaining({ amountMinorUnits: 500, qualifyingAmountMinorUnits: 500 })])
  })

  it('reserves persisted allocations before allocating newly discovered targets', () => {
    const persisted = target('ch_persisted', 300)
    const persistedKey = createIneligiblePurchaseReversalIdempotencyKey(
      reversalCase.providerEnvironment,
      reversalCase.providerApplicationId,
      reversalCase.subscriptionId,
      persisted,
    )

    expect(
      allocateReversalCaseTargets(
        reversalCase,
        [target('ch_new_sorting_first', 700), persisted],
        new Map([[persistedKey, 300]]),
      ),
    ).toEqual([
      expect.objectContaining({
        chargeId: 'ch_new_sorting_first',
        qualifyingAmountMinorUnits: 200,
      }),
      expect.objectContaining({ chargeId: 'ch_persisted', qualifyingAmountMinorUnits: 300 }),
    ])
  })

  it('fails closed when a persisted payment target disappears', () => {
    const persisted = target('ch_missing', 300)
    const persistedKey = createIneligiblePurchaseReversalIdempotencyKey(
      reversalCase.providerEnvironment,
      reversalCase.providerApplicationId,
      reversalCase.subscriptionId,
      persisted,
    )

    expect(() =>
      allocateReversalCaseTargets(reversalCase, [], new Map([[persistedKey, 300]])),
    ).toThrow('Could not reconstruct Stripe reversal target')
  })

  it('rejects invalid immutable allocations and target currency changes', () => {
    const persisted = target('ch_persisted_invalid', 600)
    const persistedKey = createIneligiblePurchaseReversalIdempotencyKey(
      reversalCase.providerEnvironment,
      reversalCase.providerApplicationId,
      reversalCase.subscriptionId,
      persisted,
    )

    expect(() =>
      allocateReversalCaseTargets(reversalCase, [persisted], new Map([[persistedKey, 600]])),
    ).toThrow('exceed the immutable case cap')
    expect(() =>
      allocateReversalCaseTargets(
        reversalCase,
        [{ ...target('ch_eur', 100), currency: 'eur' }],
        new Map(),
      ),
    ).toThrow('currency does not match its immutable case')
  })

  it('rejects an observed target that shrinks below its persisted allocation', () => {
    const original = target('ch_shrunk', 300)
    const originalKey = createIneligiblePurchaseReversalIdempotencyKey(
      reversalCase.providerEnvironment,
      reversalCase.providerApplicationId,
      reversalCase.subscriptionId,
      original,
    )

    expect(() =>
      allocateReversalCaseTargets(
        reversalCase,
        [{ ...original, amountMinorUnits: 100, qualifyingAmountMinorUnits: 100 }],
        new Map([[originalKey, 300]]),
      ),
    ).toThrow('shrank below its persisted allocation')
  })
})

function target(chargeId: string, amountMinorUnits: number) {
  return {
    amountMinorUnits,
    chargeId,
    currency: 'usd',
    invoiceId: 'in_case',
    paymentIntentId: null,
    qualifyingAmountMinorUnits: amountMinorUnits,
  }
}

describe('allocateReversalCaseTargets with an immutable case cap', () => {
  it('preserves the unprorated provider observation for future reconciliation', () => {
    expect(
      allocateReversalCaseTargets(
        {
          currency: 'usd',
          providerApplicationId: 'voucha-web',
          providerEnvironment: 'test',
          refundCapMinorUnits: 500,
          subscriptionId: 'sub_family_allocation',
        },
        [
          {
            amountMinorUnits: 1_000,
            chargeId: 'ch_family_observed',
            currency: 'usd',
            invoiceId: 'in_family_observed',
            paymentIntentId: null,
            providerObservedAmountMinorUnits: 1_000,
            qualifyingAmountMinorUnits: 1_000,
          },
        ],
        new Map(),
      ),
    ).toEqual([
      expect.objectContaining({ amountMinorUnits: 500, providerObservedAmountMinorUnits: 1_000 }),
    ])
  })

  it('does not invent a provider observation when none was supplied', () => {
    const [target] = allocateReversalCaseTargets(
      {
        currency: 'usd',
        providerApplicationId: 'voucha-web',
        providerEnvironment: 'test',
        refundCapMinorUnits: 500,
        subscriptionId: 'sub_family_no_observation',
      },
      [
        {
          amountMinorUnits: 1_000,
          chargeId: 'ch_no_observation',
          currency: 'usd',
          invoiceId: 'in_no_observation',
          paymentIntentId: null,
          qualifyingAmountMinorUnits: 1_000,
        },
      ],
      new Map(),
    )
    expect(target).toMatchObject({ amountMinorUnits: 500, qualifyingAmountMinorUnits: 500 })
    expect(target).not.toHaveProperty('providerObservedAmountMinorUnits')
  })

  it('subtracts succeeded external refunds from the immutable case cap', () => {
    expect(
      allocateReversalCaseTargets(
        {
          currency: 'usd',
          providerApplicationId: 'voucha-web',
          providerEnvironment: 'test',
          refundCapMinorUnits: 500,
          subscriptionId: 'sub_family_allocation',
        },
        [
          {
            amountMinorUnits: 800,
            chargeId: 'ch_family_external_refund',
            currency: 'usd',
            invoiceId: 'in_family_external_refund',
            externallySatisfiedMinorUnits: 200,
            paymentIntentId: null,
            providerObservedAmountMinorUnits: 800,
            qualifyingAmountMinorUnits: 1_000,
          },
        ],
        new Map(),
      ),
    ).toEqual([
      expect.objectContaining({
        amountMinorUnits: 300,
        externallySatisfiedMinorUnits: 200,
        providerObservedAmountMinorUnits: 800,
        qualifyingAmountMinorUnits: 500,
      }),
    ])
  })

  it('allocates one minor unit across split payments', () => {
    const targets = allocateReversalCaseTargets(
      {
        currency: 'usd',
        providerApplicationId: 'voucha-web',
        providerEnvironment: 'test',
        refundCapMinorUnits: 1,
        subscriptionId: 'sub_family_allocation',
      },
      [
        {
          amountMinorUnits: 1,
          chargeId: 'ch_family_first',
          currency: 'usd',
          invoiceId: 'in_family_split',
          paymentIntentId: null,
          qualifyingAmountMinorUnits: 1,
        },
        {
          amountMinorUnits: 1,
          chargeId: 'ch_family_second',
          currency: 'usd',
          invoiceId: 'in_family_split',
          paymentIntentId: null,
          qualifyingAmountMinorUnits: 1,
        },
      ],
      new Map(),
    )

    expect(targets.map(target => target.chargeId)).toEqual(['ch_family_first'])
    expect(targets.map(target => target.amountMinorUnits)).toEqual([1])
    expect(targets.reduce((total, target) => total + target.amountMinorUnits, 0)).toBe(1)
  })

  it('keeps a later payment refund out of an earlier fixed allocation', () => {
    expect(
      allocateReversalCaseTargets(
        {
          currency: 'usd',
          providerApplicationId: 'voucha-web',
          providerEnvironment: 'test',
          refundCapMinorUnits: 1,
          subscriptionId: 'sub_family_allocation',
        },
        [
          {
            amountMinorUnits: 1,
            chargeId: 'ch_family_first',
            currency: 'usd',
            invoiceId: 'in_family_timing',
            paymentIntentId: null,
            qualifyingAmountMinorUnits: 1,
          },
          {
            amountMinorUnits: 0,
            chargeId: 'ch_family_second',
            currency: 'usd',
            externallySatisfiedMinorUnits: 1,
            invoiceId: 'in_family_timing',
            paymentIntentId: null,
            qualifyingAmountMinorUnits: 1,
          },
        ],
        new Map(),
      ),
    ).toEqual([expect.objectContaining({ amountMinorUnits: 1, qualifyingAmountMinorUnits: 1 })])
  })
})
