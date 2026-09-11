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
