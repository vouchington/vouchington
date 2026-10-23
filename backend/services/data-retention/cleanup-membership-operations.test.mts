import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attemptTestMembershipOperationTransition,
  completeTestMembershipOperationAt,
  createTestImmutableMembershipOperation,
  getTestCancellationClaimContext,
} from '../../test-helpers/data-stores/psql/membership-ledger-immutability.mts'
import { createIneligiblePurchaseCancellationIdempotencyKey } from '../memberships/ineligible-stripe-purchase-reversal-idempotency.mts'
import { cleanupPaymentLedgers } from './cleanup-payment-ledgers.mts'
import { getAdministratorRefundReconciliationResult } from '../memberships/refund-reconciliation/administrator.mts'
import {
  createTestAdministratorRefundOperation,
  createTestLinkedRefundReceiptRequest,
  createTestRefundOperationAttempt,
  insertTestLinkedOperationRefundReceipt,
} from '../../test-helpers/entities/membership-refund-reconciliation-schema.mts'
import {
  attemptYoungMembershipLedgerDeletion,
  claimTestCancellationReplay,
  countRemainingRefundAttempts,
  getTestRefundReceiptIdForOperation,
  seedAdditionalRefundAttemptsForRetention,
} from '../../test-helpers/entities/membership-retention.mts'

describe('membership operation retention', () => {
  it('expires a settled cancellation after its fiscal window and keeps its exact claim identity', async () => {
    const applicationId = `retention-${randomUUID()}`
    const subscriptionId = `sub_${randomUUID()}`
    const idempotencyKey = createIneligiblePurchaseCancellationIdempotencyKey(
      'test',
      applicationId,
      subscriptionId,
    )
    const requestedAt = new Date('2018-12-30T12:00:00.000Z')
    const completedAt = new Date('2018-12-31T12:00:00.000Z')
    const id = await createTestImmutableMembershipOperation(
      idempotencyKey,
      null,
      requestedAt,
      applicationId,
    )
    const context = await getTestCancellationClaimContext(id)
    await completeTestMembershipOperationAt(id, completedAt)
    await expect(attemptTestMembershipOperationTransition(id, 'delete')).rejects.toThrow(
      /membership operations cannot be deleted outside completed fiscal retention/,
    )

    const youngKey = createIneligiblePurchaseCancellationIdempotencyKey(
      'test',
      applicationId,
      `sub_${randomUUID()}`,
    )
    const youngId = await createTestImmutableMembershipOperation(
      youngKey,
      null,
      new Date('2019-01-01T00:00:00.000Z'),
      applicationId,
    )
    await completeTestMembershipOperationAt(youngId, new Date('2019-01-01T01:00:00.000Z'))
    await expect(attemptYoungMembershipLedgerDeletion(youngId)).rejects.toThrow(
      /membership operations cannot be deleted outside completed fiscal retention/,
    )

    const result = await cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [id])
    expect(result).toContainEqual({
      family: 'membership_operation',
      scanned: 1,
      deleted: 1,
      hasMore: false,
    })

    const replay = await claimTestCancellationReplay(context, applicationId, subscriptionId)
    expect(replay).toEqual({ completed: true, leaseToken: null, id, idempotencyKey })
  })

  it('drains administrator refund attempts one page at a time before deleting their operation', async () => {
    const requestedAt = new Date('2018-12-30T12:00:00.000Z')
    const operation = await createTestAdministratorRefundOperation(
      `retention-${randomUUID()}`,
      requestedAt,
    )
    const { requestKey } = await createTestLinkedRefundReceiptRequest(operation)
    await insertTestLinkedOperationRefundReceipt(operation, requestKey)
    const refundId = await getTestRefundReceiptIdForOperation(operation.id)
    await createTestRefundOperationAttempt(operation)
    await seedAdditionalRefundAttemptsForRetention(operation.id)
    await completeTestMembershipOperationAt(operation.id, new Date('2018-12-31T12:00:00.000Z'))

    for (const remaining of [2, 1, 0]) {
      const page = await cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [operation.id])
      expect(page).toContainEqual({
        family: 'membership_operation',
        scanned: 1,
        deleted: remaining === 0 ? 1 : 0,
        hasMore: remaining > 0,
      })
      expect(await countRemainingRefundAttempts(operation.id)).toBe(remaining)
    }
    expect(await getAdministratorRefundReconciliationResult(operation.id)).toEqual({
      outcome: 'completed',
      refundId,
      cancellationStatus: 'not_requested',
    })
  })
})
