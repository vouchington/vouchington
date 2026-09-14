import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import {
  getMembershipRefundEventFixtureForTest,
  getRefundOperationLeaseTokenForTest,
} from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import { recordMembershipRefundEvent } from '../refunds/index.mts'
import {
  claimAdministratorRefundRequest,
  completeRefundReconciliation,
  discoverRefundByOperationMetadata,
  enrichRefundReconciliationAttemptProviderRefund,
  getRefundMetadataScanState,
  leaseDueRefundReconciliation,
  recordRefundReconciliationAttempt,
  scheduleRefundReconciliationRetry,
} from './index.mts'

describe('refund reconciliation ledger', () => {
  it('claims one exact administrator request and leases its due operation', async () => {
    const request = await createRequest()
    const first = await claimAdministratorRefundRequest(request)
    const replay = await claimAdministratorRefundRequest(request)

    expect(replay).toEqual(first)
    expect(first.completed).toBe(false)

    const lease = await leaseDueRefundReconciliation(first.id)
    expect(lease).toMatchObject({
      amount: { amount: 700, currency: 'usd' },
      attemptOrdinal: 1,
      id: first.id,
      provider: 'stripe',
      providerRefundId: null,
    })
    expect(lease?.leaseToken).toMatch(/^[0-9a-f-]{36}$/)
    await expect(leaseDueRefundReconciliation(first.id)).resolves.toBeNull()

    const sharedIdempotencyKey = `administrator-refund-${randomUUID()}`
    const [firstApplicationRequest, secondApplicationRequest] = await Promise.all([
      createRequest({
        idempotencyKey: sharedIdempotencyKey,
        providerApplicationId: `first-application-${randomUUID()}`,
      }),
      createRequest({
        idempotencyKey: sharedIdempotencyKey,
        providerApplicationId: `second-application-${randomUUID()}`,
      }),
    ])
    const [firstApplication, secondApplication] = await Promise.all([
      claimAdministratorRefundRequest(firstApplicationRequest),
      claimAdministratorRefundRequest(secondApplicationRequest),
    ])
    expect(firstApplication.id).not.toBe(secondApplication.id)
  })

  it('rejects a reused administrator idempotency key when the request changes', async () => {
    const original = await createRequest()
    await claimAdministratorRefundRequest(original)

    await expect(
      claimAdministratorRefundRequest({
        ...original,
        note: 'A materially different refund request',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('records attempts append-only, enriches provider identity, and schedules durable retries', async () => {
    const operation = await claimAdministratorRefundRequest(await createRequest())
    const firstLease = await leaseDueRefundReconciliation(operation.id)
    expect(firstLease).not.toBeNull()
    const providerIdempotencyKey = `provider-idempotency-${randomUUID()}`
    const attempt = await recordRefundReconciliationAttempt(firstLease!, providerIdempotencyKey)
    expect(attempt).toMatchObject({
      amount: { amount: 700, currency: 'usd' },
      attemptOrdinal: 1,
      membershipOperationId: operation.id,
      providerRefundId: null,
    })
    await expect(
      recordRefundReconciliationAttempt(firstLease!, providerIdempotencyKey),
    ).resolves.toEqual(attempt)
    const enriched = await enrichRefundReconciliationAttemptProviderRefund(
      attempt.id,
      `provider-refund-${randomUUID()}`,
    )
    expect(enriched.providerRefundId).toMatch(/^provider-refund-/)

    await scheduleRefundReconciliationRetry(
      firstLease!,
      new Date(Date.now() - 1_000),
      'provider outcome is still pending',
    )
    await expect(
      scheduleRefundReconciliationRetry(firstLease!, new Date(Date.now() - 1_000), 'stale retry'),
    ).rejects.toThrow(`Refund reconciliation ${operation.id} is already leased`)
    const secondLease = await leaseDueRefundReconciliation(operation.id)
    expect(secondLease).toMatchObject({ attemptOrdinal: 2, id: operation.id })
    await completeRefundReconciliation(secondLease!)
    await expect(leaseDueRefundReconciliation(operation.id)).resolves.toBeNull()
  })

  it('wakes a known pending administrator refund when its event receipt arrives', async () => {
    const request = await createRequest()
    const operation = await claimAdministratorRefundRequest(request)
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected a due administrator refund reconciliation lease')
    const knownRefundId = `re-known-${randomUUID()}`
    const attempt = await recordRefundReconciliationAttempt(
      lease,
      `provider-idempotency-${randomUUID()}`,
    )
    await scheduleRefundReconciliationRetry(
      lease,
      new Date(Date.now() + 60 * 60 * 1000),
      'known provider refund is pending',
    )
    const fixture = await getMembershipRefundEventFixtureForTest(request.membershipId)
    expect(lease.providerEnvironment).toBe('test')

    await expect(
      recordMembershipRefundEvent({
        amount: request.amount,
        membershipId: request.membershipId,
        membershipSourceId: fixture.membershipSourceId,
        providerApplicationId: lease.providerApplicationId,
        providerEnvironment: 'test',
        stripeChargeId: request.providerPaymentReference,
        stripeEventId: `evt-known-${randomUUID()}`,
        stripePaymentIntentId: null,
        stripeRefundId: knownRefundId,
        stripeRefundMetadata: {
          membership_refund_attempt_id: attempt.id,
          membership_refund_operation_id: operation.id,
        },
        userId: fixture.userId,
      }),
    ).resolves.toEqual({ operationIds: [operation.id] })
    await expect(leaseDueRefundReconciliation(operation.id)).resolves.toMatchObject({
      id: operation.id,
    })
  })

  it('resumes metadata discovery across bounded provider pages without creating a refund', async () => {
    const attempt = await createUnacknowledgedAttempt()
    const cursors: Array<string | undefined> = []
    const listPage = async ({ startingAfter }: { startingAfter?: string }) => {
      cursors.push(startingAfter)
      return startingAfter
        ? { hasMore: false, nextCursor: null, refunds: [{ id: 're_oldest' }] }
        : { hasMore: true, nextCursor: 're_newest', refunds: [{ id: 're_newest' }] }
    }

    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        await getRefundOperationLeaseTokenForTest(attempt.membershipOperationId),
        { chargeId: 'ch_metadata', paymentIntentId: null },
        listPage,
      ),
    ).resolves.toEqual({ outcome: 'not_found' })
    expect(cursors).toEqual([undefined, 're_newest', undefined])
    await expect(getRefundMetadataScanState(attempt.id)).resolves.toMatchObject({
      completedAt: expect.any(Date),
      nextProviderRefundId: null,
      stableHeadProviderRefundId: 're_newest',
    })
  })

  it('restarts metadata discovery when a fresh head proves the scan moved', async () => {
    const attempt = await createUnacknowledgedAttempt()
    let call = 0
    const listPage = async () => {
      call++
      return call === 1
        ? { hasMore: false, nextCursor: null, refunds: [{ id: 're_before' }] }
        : { hasMore: false, nextCursor: null, refunds: [{ id: 're_after' }] }
    }

    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        await getRefundOperationLeaseTokenForTest(attempt.membershipOperationId),
        { chargeId: 'ch_metadata', paymentIntentId: null },
        listPage,
      ),
    ).resolves.toEqual({ outcome: 'not_found' })
    expect(call).toBe(3)
    await expect(getRefundMetadataScanState(attempt.id)).resolves.toMatchObject({
      completedAt: expect.any(Date),
      stableHeadProviderRefundId: 're_after',
    })
  })

  it('persists discovery progress when the provider page budget is exhausted', async () => {
    const attempt = await createUnacknowledgedAttempt()
    const cursors: Array<string | undefined> = []
    const listPage = async ({ startingAfter }: { startingAfter?: string }) => {
      cursors.push(startingAfter)
      const suffix = String(cursors.length)
      return { hasMore: true, nextCursor: `re_${suffix}`, refunds: [{ id: `re_${suffix}` }] }
    }

    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        await getRefundOperationLeaseTokenForTest(attempt.membershipOperationId),
        { chargeId: 'ch_metadata', paymentIntentId: null },
        listPage,
      ),
    ).resolves.toEqual({ outcome: 'pending' })
    expect(cursors).toEqual([undefined, 're_1', 're_2'])
    await expect(getRefundMetadataScanState(attempt.id)).resolves.toMatchObject({
      completedAt: null,
      nextProviderRefundId: 're_3',
      stableHeadProviderRefundId: 're_1',
    })
  })

  it('returns a metadata match before a new provider refund is created', async () => {
    const attempt = await createUnacknowledgedAttempt()
    await expect(
      discoverRefundByOperationMetadata(
        attempt,
        await getRefundOperationLeaseTokenForTest(attempt.membershipOperationId),
        { chargeId: 'ch_metadata', paymentIntentId: null },
        async () => ({
          hasMore: false,
          nextCursor: null,
          refunds: [
            {
              id: 're_owned',
              metadata: {
                membership_refund_attempt_id: attempt.id,
                membership_refund_operation_id: attempt.membershipOperationId,
              },
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      outcome: 'found',
      refund: {
        id: 're_owned',
        metadata: {
          membership_refund_attempt_id: attempt.id,
          membership_refund_operation_id: attempt.membershipOperationId,
        },
      },
    })
  })
})

async function createUnacknowledgedAttempt() {
  const operation = await claimAdministratorRefundRequest(await createRequest())
  const lease = await leaseDueRefundReconciliation(operation.id)
  if (!lease) throw new Error('Expected a due administrator refund reconciliation lease')
  return recordRefundReconciliationAttempt(lease, `provider-idempotency-${randomUUID()}`)
}

async function createRequest(
  options: {
    cancelRequested?: boolean
    idempotencyKey?: string
    providerApplicationId?: string
  } = {},
) {
  const [member, administrator] = await Promise.all([createTestUser(), createTestUser()])
  const membership = await createTestMembership({
    user_id: member.id,
    provider_application_id: options.providerApplicationId,
    provider_environment: 'test',
    stripe_subscription_id: `sub-refund-reconciliation-${randomUUID()}`,
  })
  const periodStartedAt = new Date('2026-09-01T00:00:00.000Z')
  return {
    amount: { amount: 700, currency: 'usd' as const },
    cancelRequested: options.cancelRequested ?? true,
    idempotencyKey: options.idempotencyKey ?? `administrator-refund-${randomUUID()}`,
    issuedById: administrator.id,
    membershipId: membership.id,
    note: 'Customer requested a refund',
    periodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
    periodStartedAt,
    providerPaymentReference: `payment-${randomUUID()}`,
    providerSubscriptionReference:
      options.cancelRequested === false ? null : `sub-refund-reconciliation-${randomUUID()}`,
    reason: 'requested' as const,
    requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
  }
}
