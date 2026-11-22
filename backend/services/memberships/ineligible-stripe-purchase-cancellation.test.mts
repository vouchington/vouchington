import { claimTestIneligiblePurchaseReversalOperations } from '@voucha/test-helpers/membership-reversal-case-fixtures'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestSku, createTestUser } from '@voucha/test-helpers'
import { claimIneligiblePurchaseCancellationOperation } from './ineligible-stripe-purchase-cancellation.mts'
import { getLockedIneligiblePurchaseReversalCase } from './ineligible-stripe-purchase-reversal/case-ledger.mts'
import { createMembership } from './create.mts'
import {
  IneligiblePurchaseReversalInProgressError,
  markIneligiblePurchaseReversalCompleted,
} from './ineligible-stripe-purchase-reversal-execution.mts'

describe('claimIneligiblePurchaseCancellationOperation', () => {
  it.each(['before lookup', 'before claim'] as const)(
    'returns the completed cancellation when another worker completes it %s',
    async completionPoint => {
      const { options, cancellation } = await createCancellationFixture()

      await using transaction = await beginTransaction()
      const reversalCase = await getLockedIneligiblePurchaseReversalCase(options, transaction)
      if (!reversalCase) throw new Error('Expected a reversal case')
      if (completionPoint === 'before lookup')
        await markIneligiblePurchaseReversalCompleted(cancellation)
      const query = new Proxy(transaction, {
        apply(target, thisArgument, args: Parameters<typeof transaction>) {
          const [input] = args
          const statement = typeof input === 'string' ? input : input.text
          if (
            completionPoint === 'before claim' &&
            statement.includes('/* claimMembershipOperationExecutionWork */')
          )
            return markIneligiblePurchaseReversalCompleted(cancellation).then(() =>
              Reflect.apply(target, thisArgument, args),
            )
          return Reflect.apply(target, thisArgument, args)
        },
      })

      await expect(
        claimIneligiblePurchaseCancellationOperation(
          reversalCase.membershipSourceId,
          reversalCase.membershipLineageBindingId,
          reversalCase.membershipProviderLineageId,
          reversalCase.providerEnvironment,
          reversalCase.providerApplicationId,
          reversalCase.subscriptionId,
          query,
        ),
      ).resolves.toEqual({
        completed: true,
        leaseToken: null,
        id: cancellation.id,
        idempotencyKey: cancellation.idempotencyKey,
      })
      await transaction.commit()
    },
  )

  it('lets the current lease holder finish after a second worker is rejected', async () => {
    const { options, snapshot, cancellation } = await createCancellationFixture()
    await expect(
      claimTestIneligiblePurchaseReversalOperations(options, [], snapshot),
    ).rejects.toBeInstanceOf(IneligiblePurchaseReversalInProgressError)

    await markIneligiblePurchaseReversalCompleted(cancellation)
    await expect(
      claimTestIneligiblePurchaseReversalOperations(options, [], snapshot),
    ).resolves.toMatchObject({
      cancellation: { id: cancellation.id, completed: true, leaseToken: null },
    })
  })
})

async function createCancellationFixture() {
  const user = await createTestUser()
  const currentSku = await createTestSku({ plan: 'plus' })
  await createMembership({
    userId: user.id,
    plan: 'plus',
    skuId: currentSku.id,
    stripeSubscriptionId: `sub_current_cancellation_${randomUUID()}`,
    providerEnvironment: 'production',
  })
  const incomingSku = await createTestSku({ plan: 'pro' })
  const subscriptionId = `sub_cancellation_${randomUUID()}`
  const options = {
    effectiveAt: undefined,
    expiresAt: undefined,
    originatingInvoiceId: `in_cancellation_${randomUUID()}`,
    providerEnvironment: 'production' as const,
    providerApplicationId: 'voucha-web',
    stripePriceId: incomingSku.stripe_price_id,
    subscriptionId,
    userId: user.id,
  }
  const snapshot = { currency: 'usd', qualifyingAmountMinorUnits: 0 }
  const initial = await claimTestIneligiblePurchaseReversalOperations(options, [], snapshot)
  const cancellation = initial.cancellation
  if (!cancellation) throw new Error('Expected a cancellation operation')
  return { options, snapshot, cancellation }
}
