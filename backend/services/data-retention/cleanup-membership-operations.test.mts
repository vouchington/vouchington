import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  attemptTestMembershipOperationTransition,
  completeTestMembershipOperationAt,
  createTestImmutableMembershipOperation,
  getTestCancellationClaimContext,
} from '../../test-helpers/data-stores/psql/membership-ledger-immutability.mts'
import { createIneligiblePurchaseCancellationIdempotencyKey } from '../memberships/ineligible-stripe-purchase-reversal-idempotency.mts'
import { cleanupPaymentLedgers } from './cleanup-payment-ledgers.mts'
import { dataRetentionConfig } from './config.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { startAdministratorRefundReconciliation } from '../memberships/refund-reconciliation/administrator.mts'
import { releaseMembershipSourceForRebindForTest } from '@voucha/test-helpers/entities/membership-source-rebinding'
import { claimAdministratorRefundRequest } from '../memberships/refund-reconciliation/administrator-request.mts'
import {
  createTestRefundOperationAttempt,
  insertTestLinkedOperationRefundReceipt,
} from '../../test-helpers/entities/membership-refund-reconciliation-schema.mts'
import {
  attemptYoungMembershipRetainedSnapshot,
  claimTestCancellationReplay,
  completeTestRefundWithMetadataScan,
  createTestRetainableAdministratorRefund,
  createTestRetentionRefundAttempts,
} from '../../test-helpers/entities/membership-retention.mts'
import {
  attemptTestFinancialRetentionShortcut,
  attemptTestRetainedMetadataScanWrite,
  attemptTestRetainedOperationWorkWrite,
  getTestMembershipRetentionState,
} from '@voucha/test-helpers/membership-retention-state'

const year = new Date().getUTCFullYear()
const expiredRequest = new Date(Date.UTC(year - 8, 11, 30, 12))
const expiredCompletion = new Date(Date.UTC(year - 8, 11, 31, 12))

describe('membership operation retention', () => {
  it('expires a settled cancellation after its fiscal window and rejects a young forged snapshot at insertion', async () => {
    const applicationId = `retention-${randomUUID()}`
    const subscriptionId = `sub_${randomUUID()}`
    const idempotencyKey = createIneligiblePurchaseCancellationIdempotencyKey(
      'test',
      applicationId,
      subscriptionId,
    )
    const id = await createTestImmutableMembershipOperation(
      idempotencyKey,
      null,
      expiredRequest,
      applicationId,
    )
    const context = await getTestCancellationClaimContext(id)
    await completeTestMembershipOperationAt(id, expiredCompletion)
    await expect(attemptTestMembershipOperationTransition(id, 'delete')).rejects.toThrow(
      /membership operations cannot be deleted outside completed fiscal retention/,
    )
    const youngId = await createTestImmutableMembershipOperation(
      randomUUID(),
      null,
      new Date(Date.UTC(year - 7, 0, 1)),
      applicationId,
    )
    await completeTestMembershipOperationAt(youngId, new Date(Date.UTC(year - 7, 0, 1, 1)))
    const young = await getTestMembershipRetentionState(youngId)
    await expect(attemptYoungMembershipRetainedSnapshot(youngId)).rejects.toThrow(
      /retained membership operation requires an expired terminal operation and exact receipt/,
    )
    expect(await getTestMembershipRetentionState(youngId)).toEqual(young)
    expect(young).toMatchObject({ operations: 1, retained: 0 })
    expect(await cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [id])).toContainEqual({
      family: 'membership_operation',
      scanned: 1,
      deleted: 1,
      hasMore: false,
    })
    expect(await claimTestCancellationReplay(context, applicationId, subscriptionId)).toEqual({
      completed: true,
      leaseToken: null,
      id,
      idempotencyKey,
    })
  })

  it('counts scans, attempts, refund, request and parent against each cap-one page and preserves exact replay', async () => {
    const { operation, request, refundId, intent, issuerId } =
      await createTestRetainableAdministratorRefund(expiredRequest)
    const attemptId = await createTestRetentionRefundAttempts(operation.id, expiredRequest)
    await completeTestRefundWithMetadataScan(operation.id, attemptId, expiredCompletion)
    const initial = await getTestMembershipRetentionState(operation.id)
    expect(initial).toMatchObject({
      operations: 1,
      attempts: 3,
      scans: 1,
      refunds: 1,
      requests: 1,
      work: 0,
      physicalRows: 7,
    })
    const stages = [
      { attempts: 3, scans: 0, refunds: 1, requests: 1, operations: 1 },
      { attempts: 2, scans: 0, refunds: 1, requests: 1, operations: 1 },
      { attempts: 1, scans: 0, refunds: 1, requests: 1, operations: 1 },
      { attempts: 0, scans: 0, refunds: 1, requests: 1, operations: 1 },
      { attempts: 0, scans: 0, refunds: 0, requests: 1, operations: 1 },
      { attempts: 0, scans: 0, refunds: 0, requests: 0, operations: 1 },
      { attempts: 0, scans: 0, refunds: 0, requests: 0, operations: 0 },
    ]
    async function drainPage(index: number, stage: (typeof stages)[number]) {
      const before = await getTestMembershipRetentionState(operation.id)
      const page = await cleanupPaymentLedgers({ batchSize: 1, maxBatches: 1 }, [operation.id])
      const after = await getTestMembershipRetentionState(operation.id)
      expect(page).toContainEqual({
        family: 'membership_operation',
        scanned: 1,
        deleted: 1,
        hasMore: index < stages.length - 1,
      })
      expect(before.physicalRows - after.physicalRows).toBe(1)
      expect(after).toMatchObject({ ...stage, work: 0, retained: 1 })
      return after
    }
    const after = await drainPage(0, stages[0]!)
    await expect(attemptTestFinancialRetentionShortcut(operation.id, 'operation')).rejects.toThrow(
      /membership operations cannot be deleted outside completed fiscal retention/,
    )
    await expect(attemptTestFinancialRetentionShortcut(operation.id, 'request')).rejects.toThrow(
      /administrator refund request is immutable/,
    )
    await expect(createTestRefundOperationAttempt(operation)).rejects.toThrow(
      /children cannot outlive fiscal retention/,
    )
    await expect(
      insertTestLinkedOperationRefundReceipt(operation, request.idempotencyKey),
    ).rejects.toThrow(/children cannot outlive fiscal retention/)
    await expect(attemptTestRetainedMetadataScanWrite(attemptId)).rejects.toThrow(
      /children cannot outlive fiscal retention/,
    )
    await expect(attemptTestRetainedOperationWorkWrite(operation.id)).rejects.toThrow(
      /children cannot outlive fiscal retention/,
    )
    expect(await getTestMembershipRetentionState(operation.id)).toEqual(after)
    for (const [index, stage] of stages.slice(1).entries()) await drainPage(index + 1, stage)
    expect((await getTestMembershipRetentionState(operation.id)).responseSnapshot).toEqual({
      refundId,
      cancellationStatus: 'not_requested',
    })
    expect(await claimAdministratorRefundRequest(request)).toEqual({
      id: operation.id,
      completed: true,
    })
    await expect(
      claimAdministratorRefundRequest({ ...request, requestFingerprint: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      claimAdministratorRefundRequest({ ...request, issuedById: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 })
    const stripe = {
      async listSubscriptionInvoices(): Promise<never> {
        throw new Error('A retained refund replay must not contact Stripe')
      },
    }
    await expect(startAdministratorRefundReconciliation(issuerId, intent, stripe)).resolves.toEqual(
      {
        id: operation.id,
        result: { outcome: 'completed', refundId, cancellationStatus: 'not_requested' },
      },
    )
    await expect(
      startAdministratorRefundReconciliation(
        issuerId,
        { ...intent, note: 'Different request under the same key' },
        stripe,
      ),
    ).rejects.toMatchObject({ status: 409 })
    await releaseMembershipSourceForRebindForTest(operation.membershipSourceId)
    await expect(
      startAdministratorRefundReconciliation(issuerId, intent, stripe),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('uses configured twelve versus eighty-four months at UTC fiscal year boundaries', async () => {
    await dataRetentionConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      payment_ledger_retention_months: 84,
    })
    onTestFinished(restore)
    const ids: string[] = []
    for (const completedAt of [
      new Date(Date.UTC(year - 2, 11, 31, 23, 59)),
      new Date(Date.UTC(year - 1, 0, 1)),
    ]) {
      const id = await createTestImmutableMembershipOperation(randomUUID(), null, completedAt)
      await completeTestMembershipOperationAt(id, completedAt)
      ids.push(id)
    }
    expect(await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, ids)).toContainEqual({
      family: 'membership_operation',
      scanned: 2,
      deleted: 0,
      hasMore: false,
    })
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, { payment_ledger_retention_months: 0 })
    expect(await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, ids)).toContainEqual({
      family: 'membership_operation',
      scanned: 2,
      deleted: 0,
      hasMore: false,
    })
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, { payment_ledger_retention_months: 12 })
    expect(await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, ids)).toContainEqual({
      family: 'membership_operation',
      scanned: ids.toSorted().indexOf(ids[0]!) + 1,
      deleted: 1,
      hasMore: ids.toSorted().indexOf(ids[0]!) === 0,
    })
    expect(await getTestMembershipRetentionState(ids[0]!)).toMatchObject({
      operations: 0,
      retained: 1,
    })
    expect(await getTestMembershipRetentionState(ids[1]!)).toMatchObject({
      operations: 1,
      retained: 0,
    })
    expect(await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, ids)).toContainEqual({
      family: 'membership_operation',
      scanned: 1,
      deleted: 0,
      hasMore: false,
    })
  })

  it('keeps an unfinished earliest scoped operation ahead of the next eligible operation', async () => {
    const { operation, request } = await createTestRetainableAdministratorRefund(expiredRequest)
    const attemptId = await createTestRetentionRefundAttempts(operation.id, expiredRequest)
    await completeTestRefundWithMetadataScan(operation.id, attemptId, expiredCompletion)
    const second = await createTestImmutableMembershipOperation(randomUUID(), null, expiredRequest)
    await completeTestMembershipOperationAt(second, expiredCompletion)
    const ids = [operation.id, second].toSorted()
    expect(ids[0]).toBe(operation.id)
    const stages = [
      { attempts: 2, requests: 1, refunds: 1, operations: 1, physicalRows: 5 },
      { attempts: 0, requests: 1, refunds: 1, operations: 1, physicalRows: 3 },
      { attempts: 0, requests: 0, refunds: 0, operations: 1, physicalRows: 1 },
      { attempts: 0, requests: 0, refunds: 0, operations: 0, physicalRows: 0 },
    ]
    for (const stage of stages) {
      expect(await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, ids)).toContainEqual({
        family: 'membership_operation',
        scanned: 1,
        deleted: stage.operations ? 2 : 1,
        hasMore: true,
      })
      expect(await getTestMembershipRetentionState(operation.id)).toMatchObject(stage)
      expect(await getTestMembershipRetentionState(second)).toMatchObject({
        operations: 1,
        retained: 0,
      })
    }
    expect(await cleanupPaymentLedgers({ batchSize: 2, maxBatches: 1 }, ids)).toContainEqual({
      family: 'membership_operation',
      scanned: 1,
      deleted: 1,
      hasMore: false,
    })
    expect(await claimAdministratorRefundRequest(request)).toEqual({
      id: operation.id,
      completed: true,
    })
  })
})
