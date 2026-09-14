import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { getRefundOperationRetryStateForTest } from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import {
  claimAdministratorRefundRequest,
  discoverRefundByOperationMetadata,
  leaseDueRefundReconciliation,
  reconcileLeasedRefundOperation,
  reconcileMembershipRefundOperation,
  recordRefundReconciliationAttempt,
  scheduleRefundReconciliationRetry,
  type RefundReconciliationLease,
  type RefundProviderOperations,
} from './index.mts'
import type { RefundReconciliationPolicy } from './reconcile.mts'

describe('refund reconciliation retries', () => {
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
    const createRefund = vi
      .fn<RefundProviderOperations['createRefund']>()
      .mockRejectedValue(new Error('Stripe network interruption'))

    await expect(
      reconcileMembershipRefundOperation(lease, providerOperations({ createRefund })),
    ).resolves.toBeUndefined()
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
    const createRefund = vi.fn<RefundProviderOperations['createRefund']>().mockResolvedValue({
      amount: 700,
      charge: 'ch_new_attempt',
      currency: 'usd',
      id: `re_new_attempt_${randomUUID()}`,
      payment_intent: null,
      status: 'succeeded',
    } as never)

    await reconcileMembershipRefundOperation(retryLease, providerOperations({ createRefund }))
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

  it('retrieves an already known provider refund before creating another attempt', async () => {
    const operation = await claimAdministratorRefundRequest(await request())
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected reconciliation lease')
    const complete = vi.fn<RefundReconciliationPolicy<{ requestId: string }>['complete']>()
    const getRefund = vi.fn<RefundProviderOperations['getRefund']>().mockResolvedValue({
      amount: 700,
      charge: `ch_known_${randomUUID()}`,
      currency: 'usd',
      id: `re_known_${randomUUID()}`,
      payment_intent: null,
      status: 'succeeded',
    } as never)

    await reconcileLeasedRefundOperation(
      lease,
      policy({ complete, knownProviderRefundId: () => `re_known_${randomUUID()}` }),
      providerOperations({ getRefund }),
    )

    expect(getRefund).toHaveBeenCalledWith(expect.stringMatching(/^re_known_/))
    expect(complete).toHaveBeenCalledWith(
      lease,
      { requestId: operation.id },
      expect.objectContaining({ status: 'succeeded' }),
    )
  })

  it.each(['failed', 'pending', 'mismatched'] as const)(
    'schedules a durable retry for a %s provider outcome',
    async outcome => {
      const operation = await claimAdministratorRefundRequest(await request())
      const lease = await leaseDueRefundReconciliation(operation.id)
      if (!lease) throw new Error('Expected reconciliation lease')
      const createRefund = vi.fn<RefundProviderOperations['createRefund']>().mockResolvedValue({
        amount: outcome === 'mismatched' ? 699 : 700,
        charge: `ch_${outcome}_${randomUUID()}`,
        currency: 'usd',
        id: `re_${outcome}_${randomUUID()}`,
        payment_intent: null,
        status: outcome === 'failed' ? 'failed' : outcome === 'pending' ? 'pending' : 'succeeded',
      } as never)

      await reconcileLeasedRefundOperation(
        lease,
        policy({ providerFailuresAreDurable: true }),
        providerOperations({ createRefund }),
      )

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

  it('returns a non-durable provider failure to its caller', async () => {
    const operation = await claimAdministratorRefundRequest(await request())
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected reconciliation lease')
    const createRefund = vi
      .fn<RefundProviderOperations['createRefund']>()
      .mockRejectedValue(new Error('provider connection reset'))

    await expect(
      reconcileLeasedRefundOperation(lease, policy(), providerOperations({ createRefund })),
    ).rejects.toThrow('provider connection reset')
  })
})

function policy(
  overrides: Partial<RefundReconciliationPolicy<{ requestId: string }>> = {},
): RefundReconciliationPolicy<{ requestId: string }> {
  return {
    complete: async () => 'completed',
    createLookup: () => ({ chargeId: `ch_policy_${randomUUID()}` }),
    getContext: async operationId => ({ requestId: operationId }),
    lookup: () => ({ chargeId: null, paymentIntentId: `pi_policy_${randomUUID()}` }),
    providerIdempotencyKey: (lease: RefundReconciliationLease) =>
      `policy-refund-${lease.id}-${lease.attemptOrdinal}`,
    ...overrides,
  }
}

function providerOperations(
  overrides: Partial<RefundProviderOperations>,
): RefundProviderOperations {
  return {
    createRefund: vi.fn<RefundProviderOperations['createRefund']>(),
    getRefund: vi.fn<RefundProviderOperations['getRefund']>(),
    listRefundPage: vi.fn<RefundProviderOperations['listRefundPage']>(),
    ...overrides,
  }
}

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
