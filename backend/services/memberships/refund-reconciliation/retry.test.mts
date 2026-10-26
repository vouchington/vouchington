import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import * as stripeRefunds from '@modules/stripe/refunds'
import {
  getRefundOperationRetryStateForTest,
  getRefundReceiptCountForTest,
  recordExpiredRefundAttemptForTest,
} from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import {
  claimAdministratorRefundRequest,
  discoverRefundByOperationMetadata,
  enrichRefundReconciliationAttemptProviderRefund,
  leaseDueRefundReconciliation,
  reconcileMembershipRefundOperation,
  recordRefundReconciliationAttempt,
  scheduleRefundReconciliationRetry,
} from './index.mts'

describe('refund reconciliation retries', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires exact attempt metadata before accepting a discovered refund', async () => {
    const { attempt, lease } = await createAttempt()
    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        lease.leaseToken,
        { chargeId: 'ch_metadata', paymentIntentId: null },
        async () => ({
          hasMore: false,
          nextCursor: null,
          refunds: [
            {
              id: 're_other_attempt',
              metadata: {
                membership_refund_attempt_id: randomUUID(),
                membership_refund_operation_id: attempt.membershipOperationId,
              },
            },
          ],
        }),
      ),
    ).resolves.toEqual({ outcome: 'not_found' })
  })

  it('rejects a repeated continuation cursor', async () => {
    const { attempt, lease } = await createAttempt()
    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        lease.leaseToken,
        { chargeId: 'ch_metadata', paymentIntentId: null },
        async ({ startingAfter }) => ({
          hasMore: true,
          nextCursor: startingAfter ?? 're_repeat',
          refunds: [{ id: 're_repeat' }],
        }),
      ),
    ).rejects.toThrow('repeated its cursor')
  })

  it('rejects a page that claims another page without a cursor', async () => {
    const { attempt, lease } = await createAttempt()
    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        lease.leaseToken,
        { chargeId: 'ch_metadata', paymentIntentId: null },
        async () => ({ hasMore: true, nextCursor: null, refunds: [{ id: 're_missing_cursor' }] }),
      ),
    ).rejects.toThrow('has_more requires a next cursor')
  })

  it('schedules an administrator provider exception without failing the caller', async () => {
    const operation = await claimAdministratorRefundRequest(await request())
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected administrator reconciliation lease')
    vi.spyOn(stripeRefunds, 'createStripeRefund').mockRejectedValue(
      new Error('Stripe network interruption'),
    )

    await expect(reconcileMembershipRefundOperation(lease)).resolves.toBeUndefined()
    await expect(getRefundOperationRetryStateForTest(operation.id)).resolves.toEqual({
      due: true,
      failed: true,
      leased: false,
    })
  })

  it('creates a fresh current attempt after a completed stable metadata miss', async () => {
    const operation = await claimAdministratorRefundRequest(await request())
    const firstLease = await leaseDueRefundReconciliation(operation.id)
    if (!firstLease) throw new Error('Expected initial reconciliation lease')
    const firstAttempt = await recordRefundReconciliationAttempt(
      firstLease,
      `expired-${randomUUID()}`,
    )
    await expect(
      discoverRefundByOperationMetadata(
        firstAttempt,
        firstLease.leaseToken,
        { chargeId: 'ch_new_attempt', paymentIntentId: null },
        async () => ({ hasMore: false, nextCursor: null, refunds: [] }),
      ),
    ).resolves.toEqual({ outcome: 'not_found' })
    await scheduleRefundReconciliationRetry(firstLease, new Date(Date.now() - 1), 'retry discovery')
    const retryLease = await leaseDueRefundReconciliation(operation.id)
    if (!retryLease) throw new Error('Expected retry reconciliation lease')
    const createRefund = vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue({
      amount: 700,
      charge: 'ch_new_attempt',
      currency: 'usd',
      id: `re_new_attempt_${randomUUID()}`,
      payment_intent: null,
      status: 'succeeded',
    } as never)

    await reconcileMembershipRefundOperation(retryLease)
    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `voucha-membership-refund-reconciliation:${operation.id}:${retryLease.attemptOrdinal}`,
        metadata: {
          membership_refund_attempt_id: expect.not.stringMatching(firstAttempt.id),
          membership_refund_operation_id: operation.id,
        },
      }),
    )
  })

  it('fences scan writes after the lease rotates', async () => {
    const { attempt, lease } = await createAttempt()
    await scheduleRefundReconciliationRetry(lease, new Date(Date.now() - 1), 'rotate lease')
    await expect(
      leaseDueRefundReconciliation(attempt.membershipOperationId),
    ).resolves.not.toBeNull()
    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        lease.leaseToken,
        { chargeId: 'ch_metadata', paymentIntentId: null },
        async () => ({ hasMore: false, nextCursor: null, refunds: [{ id: 're_stale' }] }),
      ),
    ).rejects.toThrow('metadata scan lease is stale')
  })

  it('retrieves a refund recorded on a durable attempt without creating another', async () => {
    const refundRequest = await request()
    const operation = await claimAdministratorRefundRequest(refundRequest)
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected reconciliation lease')
    const attempt = await recordRefundReconciliationAttempt(lease, `known-${randomUUID()}`)
    const refundId = `re_known_${randomUUID()}`
    await enrichRefundReconciliationAttemptProviderRefund(attempt.id, refundId)
    const getRefund = vi.spyOn(stripeRefunds, 'getStripeRefund').mockResolvedValue({
      amount: 700,
      charge: refundRequest.providerPaymentReference,
      currency: 'usd',
      id: refundId,
      payment_intent: null,
      status: 'succeeded',
    } as never)
    const createRefund = vi.spyOn(stripeRefunds, 'createStripeRefund')

    await reconcileMembershipRefundOperation(lease)

    expect(getRefund).toHaveBeenCalledWith(refundId)
    expect(createRefund).not.toHaveBeenCalled()
    await expect(getRefundReceiptCountForTest(operation.id)).resolves.toBe(1)
  })

  it('recovers a provider refund after an expired attempt lost its create reply', async () => {
    const refundRequest = await request()
    const operation = await claimAdministratorRefundRequest(refundRequest)
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected reconciliation lease')
    const attemptId = await recordExpiredRefundAttemptForTest(lease)
    const headId = `re_head_${randomUUID()}`
    const refundId = `re_recovered_${randomUUID()}`
    const recoveredRefund: Awaited<ReturnType<typeof stripeRefunds.getStripeRefund>> = {
      amount: 700,
      balance_transaction: null,
      charge: refundRequest.providerPaymentReference,
      created: Math.floor(Date.now() / 1000),
      currency: 'usd',
      customer: null,
      customer_account: null,
      id: refundId,
      lastResponse: { headers: {}, requestId: `req_${randomUUID()}`, statusCode: 200 },
      metadata: {
        membership_refund_attempt_id: attemptId,
        membership_refund_operation_id: operation.id,
      },
      object: 'refund',
      payment_intent: null,
      payment_method: null,
      reason: null,
      receipt_number: null,
      source_transfer_reversal: null,
      status: 'succeeded',
      transfer_reversal: null,
    }
    const listRefunds = vi
      .spyOn(stripeRefunds, 'listStripeRefundsForPaymentPage')
      .mockImplementation(async ({ startingAfter }) =>
        startingAfter
          ? {
              hasMore: false,
              nextCursor: undefined,
              refunds: [recoveredRefund],
            }
          : {
              hasMore: true,
              nextCursor: headId,
              refunds: [{ ...recoveredRefund, id: headId, metadata: {} }],
            },
      )
    const getRefund = vi.spyOn(stripeRefunds, 'getStripeRefund').mockResolvedValue(recoveredRefund)
    const createRefund = vi.spyOn(stripeRefunds, 'createStripeRefund')

    await reconcileMembershipRefundOperation(lease)

    expect(listRefunds).toHaveBeenNthCalledWith(1, {
      chargeId: refundRequest.providerPaymentReference,
      paymentIntentId: null,
    })
    expect(listRefunds).toHaveBeenNthCalledWith(2, {
      chargeId: refundRequest.providerPaymentReference,
      paymentIntentId: null,
      startingAfter: headId,
    })
    expect(getRefund).toHaveBeenCalledWith(refundId)
    expect(createRefund).not.toHaveBeenCalled()
    await expect(getRefundReceiptCountForTest(operation.id)).resolves.toBe(1)
  })

  it.each(['failed', 'pending', 'mismatched'] as const)(
    'schedules a durable retry for a %s provider outcome',
    async outcome => {
      const refundRequest = await request()
      const operation = await claimAdministratorRefundRequest(refundRequest)
      const lease = await leaseDueRefundReconciliation(operation.id)
      if (!lease) throw new Error('Expected reconciliation lease')
      const createRefund = vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue({
        amount: outcome === 'mismatched' ? 699 : 700,
        charge: refundRequest.providerPaymentReference,
        currency: 'usd',
        id: `re_${outcome}_${randomUUID()}`,
        payment_intent: null,
        status: outcome === 'failed' ? 'failed' : outcome === 'pending' ? 'pending' : 'succeeded',
      } as never)

      await reconcileMembershipRefundOperation(lease)

      expect(createRefund).toHaveBeenCalledOnce()
      await expect(getRefundOperationRetryStateForTest(operation.id)).resolves.toEqual({
        due: true,
        failed: true,
        leased: false,
      })
      expect(createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ membership_refund_operation_id: operation.id }),
        }),
      )
    },
  )
})

async function createAttempt() {
  const operation = await claimAdministratorRefundRequest(await request())
  const lease = await leaseDueRefundReconciliation(operation.id)
  if (!lease) throw new Error('Expected reconciliation lease')
  const attempt = await recordRefundReconciliationAttempt(lease, `attempt-${randomUUID()}`)
  return { attempt, lease }
}

async function request() {
  const [member, administrator] = await Promise.all([createTestUser(), createTestUser()])
  const membership = await createTestMembership({
    user_id: member.id,
    stripe_subscription_id: `sub_reconciliation_${randomUUID()}`,
  })
  return {
    amount: { amount: 700, currency: 'usd' as const },
    cancelRequested: false,
    idempotencyKey: `administrator-refund-${randomUUID()}`,
    issuedById: administrator.id,
    membershipId: membership.id,
    note: null,
    periodEndsAt: null,
    periodStartedAt: null,
    providerPaymentReference: `ch_reconciliation_${randomUUID()}`,
    providerSubscriptionReference: null,
    reason: 'requested' as const,
    requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
  }
}
