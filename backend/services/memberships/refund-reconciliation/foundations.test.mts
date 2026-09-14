import { describe, expect, it } from 'vitest'
import { paymentCreateLookup, paymentLookup, type RefundContext } from './context.mts'
import { mapAttempt, mapLease } from './ledger-mappers.mts'
import {
  callRefundProvider,
  RefundProviderOperationError,
  unwrapRefundProviderOperationError,
} from './provider-operations.mts'

describe('refund reconciliation foundations', () => {
  it('maps charge and payment-intent references into their provider lookups', () => {
    expect(paymentLookup(context('ch_charge'))).toEqual({
      chargeId: 'ch_charge',
      paymentIntentId: null,
    })
    expect(paymentCreateLookup(context('ch_charge'))).toEqual({ chargeId: 'ch_charge' })
    expect(paymentLookup(context('pi_intent'))).toEqual({
      chargeId: null,
      paymentIntentId: 'pi_intent',
    })
    expect(paymentCreateLookup(context('pi_intent'))).toEqual({ paymentIntentId: 'pi_intent' })
  })

  it('rejects ledger rows with currencies outside the shared money vocabulary', () => {
    expect(() => mapLease({ ...leaseRow(), currency: 'not-a-currency' })).toThrow(
      'Invalid reconciliation currency',
    )
    expect(() => mapAttempt({ ...attemptRow(), currency: 'not-a-currency' })).toThrow(
      'Invalid reconciliation currency',
    )
  })

  it('preserves provider failures as their original causes', async () => {
    const failure = new Error('provider unavailable')

    await expect(callRefundProvider('create', async () => 'created')).resolves.toBe('created')
    await expect(
      callRefundProvider('create', async () => Promise.reject(failure)),
    ).rejects.toMatchObject({ cause: failure, name: 'RefundProviderOperationError' })
    expect(
      unwrapRefundProviderOperationError(new RefundProviderOperationError('wrapped', failure)),
    ).toBe(failure)
    expect(unwrapRefundProviderOperationError(failure)).toBe(failure)
  })
})

function context(providerPaymentReference: string): RefundContext {
  return {
    administratorRequestKey: 'administrator-request',
    cancelRequested: false,
    issuedById: 'administrator',
    membershipId: 'membership',
    membershipSourceId: 'membership-source',
    note: null,
    providerPaymentReference,
    providerSubscriptionReference: null,
    reason: 'requested',
    requestFingerprint: 'fingerprint',
    userId: 'member',
  }
}

function leaseRow() {
  return {
    amountMinorUnits: '700',
    attemptOrdinal: 1,
    currency: 'usd',
    id: '019fafb8-a44c-73e2-890a-497ff3dd27a6',
    leaseToken: '019fafb8-a44c-73e2-890a-497ff3dd27a7',
    provider: 'stripe',
    providerApplicationId: 'voucha-web',
    providerEnvironment: 'test',
    providerRefundId: null,
  }
}

function attemptRow() {
  return {
    amountMinorUnits: '700',
    attemptOrdinal: 1,
    currency: 'usd',
    id: '019fafb8-a44c-73e2-890a-497ff3dd27a8',
    membershipOperationId: '019fafb8-a44c-73e2-890a-497ff3dd27a6',
    providerIdempotencyKey: 'provider-idempotency',
    providerRefundId: null,
  }
}
