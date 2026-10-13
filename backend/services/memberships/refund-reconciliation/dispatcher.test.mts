import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import {
  acquireTestPostgresAdvisoryLock,
  type TestPostgresAdvisoryLock,
} from '../../../test-helpers/postgres-advisory-lock.mts'
import {
  ageRefundReconciliationLeaseForTest,
  cleanupRefundReconciliationOperationsForTest,
  prioritizeRefundReconciliationOperationsForTest,
  withLockedRefundOperationForTest,
} from '../../../test-helpers/entities/membership-refund-reconciliation-state.mts'
import {
  claimAdministratorRefundRequest,
  dispatchDueRefundReconciliations,
  leaseDueRefundReconciliation,
  scheduleRefundReconciliationRetry,
} from './index.mts'

const ownedOperationIds: string[] = []

describe('refund reconciliation dispatcher', () => {
  let reservation: TestPostgresAdvisoryLock

  beforeAll(async () => {
    reservation = await acquireTestPostgresAdvisoryLock({
      namespace: 2_135_050,
      key: 1,
      timeout: '20s',
    })
  })

  afterEach(async () => {
    await cleanupRefundReconciliationOperationsForTest(ownedOperationIds)
    ownedOperationIds.length = 0
  })

  afterAll(async () => {
    await reservation.release()
  })

  it('leases the earliest due operations in a caller-bounded batch', async () => {
    const first = await createDueOperation()
    const second = await createDueOperation()
    const third = await createDueOperation()
    await prioritizeRefundReconciliationOperationsForTest([first.id, second.id, third.id])

    const batch = await dispatchDueRefundReconciliations(2)
    expect(batch.map(item => item.id)).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(batch).toHaveLength(2)
    expect(batch.every(item => /^[0-9a-f-]{36}$/.test(item.leaseToken))).toBe(true)

    await expect(dispatchDueRefundReconciliations(1)).resolves.toEqual([
      expect.objectContaining({ id: third.id }),
    ])
  })

  it('skips a due row locked by another dispatcher', async () => {
    const locked = await createDueOperation()
    const available = await createDueOperation()
    await prioritizeRefundReconciliationOperationsForTest([locked.id, available.id])
    await withLockedRefundOperationForTest(locked.id, async () => {
      await expect(dispatchDueRefundReconciliations(1)).resolves.toEqual([
        expect.objectContaining({ id: available.id }),
      ])
    })
    await expect(dispatchDueRefundReconciliations(1)).resolves.toEqual([
      expect.objectContaining({ id: locked.id }),
    ])
  })

  it('rotates a stale lease so an orphaned child cannot retain ownership', async () => {
    const operation = await createDueOperation()
    await prioritizeRefundReconciliationOperationsForTest([operation.id])
    const [firstLease] = await dispatchDueRefundReconciliations(1)
    expect(firstLease?.id).toBe(operation.id)
    await ageRefundReconciliationLeaseForTest(operation.id)

    const [reclaimed] = await dispatchDueRefundReconciliations(1)
    expect(reclaimed?.id).toBe(operation.id)
    expect(reclaimed?.leaseToken).not.toBe(firstLease?.leaseToken)
  })
})

async function createDueOperation() {
  const [member, administrator] = await Promise.all([createTestUser(), createTestUser()])
  const membership = await createTestMembership({
    user_id: member.id,
    stripe_subscription_id: `sub_dispatch_${randomUUID()}`,
  })
  const operation = await claimAdministratorRefundRequest({
    amount: { amount: 700, currency: 'usd' },
    cancelRequested: true,
    idempotencyKey: `administrator-refund-${randomUUID()}`,
    issuedById: administrator.id,
    membershipId: membership.id,
    note: null,
    periodEndsAt: null,
    periodStartedAt: null,
    providerPaymentReference: `ch_dispatch_${randomUUID()}`,
    providerSubscriptionReference: `sub_dispatch_${randomUUID()}`,
    reason: 'requested',
    requestFingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'),
  })
  const lease = await leaseDueRefundReconciliation(operation.id)
  if (!lease) throw new Error('Expected the new refund operation to be due')
  await scheduleRefundReconciliationRetry(
    lease,
    new Date('1900-01-01T00:00:00.000Z'),
    'dispatcher test setup',
  )
  ownedOperationIds.push(operation.id)
  return operation
}
