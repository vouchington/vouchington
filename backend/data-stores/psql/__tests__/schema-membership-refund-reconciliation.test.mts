import { afterAll, describe, expect, it } from 'vitest'
import {
  claimTestAdministratorRefundOperation,
  createTestAdministratorRefundOperation,
  createTestAdministratorRefundRequest,
  createTestLinkedRefundReceiptRequest,
  createTestRefundOperationAttempt,
  deleteTestRefundOperationAttempt,
  enrichTestRefundOperationAttemptProviderId,
  getTestAdministratorRefundRetryState,
  hasExpectedTestMembershipOperationReconciliationDueIndex,
  getTestMembershipRefundOperationLinkNullable,
  insertTestLegacyUnlinkedRefundReceipt,
  insertTestLinkedOperationRefundReceipt,
  mutateTestAdministratorRefundRequest,
  mutateTestRefundOperationAttemptAmount,
  scheduleTestAdministratorRefundRetry,
} from '../../../test-helpers/entities/membership-refund-reconciliation-schema.mts'
import { onGracefulShutdown } from '../index.mts'

describe('membership refund reconciliation schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('leases due administrator refund operations and records retry state', async () => {
    const operation = await createTestAdministratorRefundOperation()
    await expect(claimTestAdministratorRefundOperation(operation.id)).resolves.toBe(1)
    await expect(scheduleTestAdministratorRefundRetry(operation.id)).resolves.toBe(1)

    await expect(getTestAdministratorRefundRetryState(operation.id)).resolves.toEqual(
      expect.objectContaining({
        reconciliationAttemptOrdinal: 1,
        reconciliationDueAt: expect.any(Date),
      }),
    )
    await expect(hasExpectedTestMembershipOperationReconciliationDueIndex()).resolves.toBe(true)
  })

  it('keeps administrator refund requests immutable and refund attempts append-only', async () => {
    const operation = await createTestAdministratorRefundOperation()
    const requestId = await createTestAdministratorRefundRequest(operation.id)
    await expect(mutateTestAdministratorRefundRequest(requestId)).rejects.toThrow(
      'membership administrator refund requests are immutable',
    )

    const attemptId = await createTestRefundOperationAttempt(operation)
    await expect(enrichTestRefundOperationAttemptProviderId(attemptId)).resolves.toBe(1)
    await expect(mutateTestRefundOperationAttemptAmount(attemptId)).rejects.toThrow(
      'only allow provider refund ID enrichment',
    )
    await expect(deleteTestRefundOperationAttempt(attemptId)).rejects.toThrow(
      'membership refund operation attempts cannot be deleted',
    )

    await expect(getTestMembershipRefundOperationLinkNullable()).resolves.toBe(true)
  })

  it('scopes provider refund identities to the provider application context', async () => {
    const [first, second] = await Promise.all([
      createTestAdministratorRefundOperation(),
      createTestAdministratorRefundOperation(),
    ])
    const providerRefundId = 'refund-provider-scoped'
    await expect(
      Promise.all(
        [first, second].map(operation =>
          createTestRefundOperationAttempt(operation, providerRefundId),
        ),
      ),
    ).resolves.toHaveLength(2)
  })

  it('accepts legacy unlinked receipts and structurally links new operation receipts', async () => {
    const operation = await createTestAdministratorRefundOperation()
    const { requestKey } = await createTestLinkedRefundReceiptRequest(operation.id)
    await expect(insertTestLegacyUnlinkedRefundReceipt(operation.membershipSourceId)).resolves.toBe(
      1,
    )
    await expect(insertTestLinkedOperationRefundReceipt(operation, requestKey)).resolves.toBe(1)
  })
})
