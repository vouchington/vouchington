import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import {
  getRefundCancellationConvergenceForTest,
  getRefundReceiptCountForTest,
  makeRefundOperationDueForTest,
} from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import {
  claimAdministratorRefundRequest,
  leaseDueRefundReconciliation,
  reconcileMembershipRefundOperation,
  scheduleRefundReconciliationRetry,
  type RefundProviderOperations,
} from './index.mts'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'

describe('administrator refund cancellation reconciliation', () => {
  const mockCancelSubscription = vi.spyOn(
    stripeSubscriptions,
    'cancelStripeSubscriptionImmediately',
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists the receipt before cancellation, then converges projection and audit once on replay', async () => {
    const request = await createCancellationRequest()
    const operation = await claimAdministratorRefundRequest(request)
    const lease = await leaseDueRefundReconciliation(operation.id)
    if (!lease) throw new Error('Expected administrator reconciliation lease')
    const providerOperations = successfulRefundOperations(request.providerPaymentReference)
    let receiptCountDuringCancellation = 0
    mockCancelSubscription.mockImplementation(async () => {
      receiptCountDuringCancellation = await getRefundReceiptCountForTest(operation.id)
      return {} as never
    })

    await reconcileMembershipRefundOperation(lease, providerOperations)

    expect(receiptCountDuringCancellation).toBe(1)
    await expect(
      getRefundCancellationConvergenceForTest(operation.id, request.membershipId),
    ).resolves.toEqual({
      auditCount: '1',
      completed: true,
      receiptCount: '1',
      revokedAccess: true,
      status: 'cancelled',
    })

    await reconcileMembershipRefundOperation(lease, providerOperations)
    const replay = await claimAdministratorRefundRequest(request)
    expect(replay).toEqual({ completed: true, id: operation.id })
    expect(providerOperations.createRefund).toHaveBeenCalledOnce()
    expect(mockCancelSubscription).toHaveBeenCalledOnce()
    await expect(
      getRefundCancellationConvergenceForTest(operation.id, request.membershipId),
    ).resolves.toMatchObject({
      auditCount: '1',
      receiptCount: '1',
    })
  })

  it('keeps a succeeded receipt pending after a lost cancellation reply and resumes it without another refund', async () => {
    const request = await createCancellationRequest()
    const operation = await claimAdministratorRefundRequest(request)
    const firstLease = await leaseDueRefundReconciliation(operation.id)
    if (!firstLease) throw new Error('Expected first administrator reconciliation lease')
    const providerOperations = successfulRefundOperations(request.providerPaymentReference)
    mockCancelSubscription.mockRejectedValueOnce(new Error('Stripe DELETE response was lost'))

    await reconcileMembershipRefundOperation(firstLease, providerOperations)

    await expect(
      getRefundCancellationConvergenceForTest(operation.id, request.membershipId),
    ).resolves.toEqual({
      auditCount: '0',
      completed: false,
      receiptCount: '1',
      revokedAccess: false,
      status: 'active',
    })
    await makeRefundOperationDueForTest(operation.id)
    const retryLease = await leaseDueRefundReconciliation(operation.id)
    if (!retryLease) throw new Error('Expected retry reconciliation lease')
    mockCancelSubscription.mockResolvedValueOnce({} as never)

    await reconcileMembershipRefundOperation(retryLease, providerOperations)

    expect(providerOperations.createRefund).toHaveBeenCalledOnce()
    expect(providerOperations.getRefund).toHaveBeenCalledWith(expect.stringMatching(/^re_/))
    expect(mockCancelSubscription).toHaveBeenCalledTimes(2)
    await expect(
      getRefundCancellationConvergenceForTest(operation.id, request.membershipId),
    ).resolves.toEqual({
      auditCount: '1',
      completed: true,
      receiptCount: '1',
      revokedAccess: true,
      status: 'cancelled',
    })
  })

  it('fences a stale cancellation dispatch before it can write a receipt or call Stripe', async () => {
    const request = await createCancellationRequest()
    const operation = await claimAdministratorRefundRequest(request)
    const firstLease = await leaseDueRefundReconciliation(operation.id)
    if (!firstLease) throw new Error('Expected first administrator reconciliation lease')
    await scheduleRefundReconciliationRetry(firstLease, new Date(Date.now() - 1), 'rotate lease')
    const secondLease = await leaseDueRefundReconciliation(operation.id)
    if (!secondLease) throw new Error('Expected rotated administrator reconciliation lease')
    const providerOperations = successfulRefundOperations(request.providerPaymentReference)

    await reconcileMembershipRefundOperation(firstLease, providerOperations)

    expect(providerOperations.createRefund).not.toHaveBeenCalled()
    expect(mockCancelSubscription).not.toHaveBeenCalled()
    await expect(getRefundReceiptCountForTest(operation.id)).resolves.toBe(0)
  })
})

function successfulRefundOperations(paymentReference: string): RefundProviderOperations {
  const refund = {
    amount: 700,
    charge: paymentReference,
    currency: 'usd',
    id: `re_${randomUUID()}`,
    payment_intent: null,
    status: 'succeeded',
  }
  return {
    createRefund: vi
      .fn<RefundProviderOperations['createRefund']>()
      .mockResolvedValue(refund as never),
    getRefund: vi.fn<RefundProviderOperations['getRefund']>().mockResolvedValue(refund as never),
    listRefundPage: vi.fn<RefundProviderOperations['listRefundPage']>(),
  }
}

async function createCancellationRequest() {
  const [member, administrator] = await Promise.all([
    createTestUser(),
    createTestUser({ administrator: true }),
  ])
  const subscriptionId = `sub_refund_cancel_${randomUUID()}`
  const membership = await createTestMembership({
    user_id: member.id,
    stripe_subscription_id: subscriptionId,
  })
  return {
    amount: { amount: 700, currency: 'usd' as const },
    cancelRequested: true,
    idempotencyKey: `administrator-refund-${randomUUID()}`,
    issuedById: administrator.id,
    membershipId: membership.id,
    note: 'Customer requested cancellation with refund',
    periodEndsAt: null,
    periodStartedAt: null,
    providerPaymentReference: `ch_refund_cancel_${randomUUID()}`,
    providerSubscriptionReference: subscriptionId,
    reason: 'requested' as const,
    requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
  }
}
