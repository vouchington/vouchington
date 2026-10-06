import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createExecutionLeaseOperation,
  expireMembershipOperationExecutionLease,
  getMembershipOperationExecutionWork,
} from '@voucha/test-helpers/data-stores/psql/membership-operation-leases'
import {
  completeRefundReconciliation,
  leaseDueRefundReconciliation,
  scheduleRefundReconciliationRetry,
} from './refund-reconciliation/ledger.mts'

describe('membership operation execution work', () => {
  it('fences an expired owner from the successor and removes completed work', async () => {
    const id = await createExecutionLeaseOperation(`execution-work-${randomUUID()}`)
    const first = await leaseDueRefundReconciliation(id)
    expect(first).not.toBeNull()
    await expireMembershipOperationExecutionLease(id)
    const second = await leaseDueRefundReconciliation(id)
    expect(second).not.toBeNull()
    expect(second!.leaseToken).not.toBe(first!.leaseToken)

    await expect(completeRefundReconciliation(first!)).rejects.toThrow('already leased')
    await expect(
      scheduleRefundReconciliationRetry(first!, new Date(), 'stale failure'),
    ).rejects.toThrow('already leased')
    expect(await getMembershipOperationExecutionWork(id)).toMatchObject({
      lease_token: second!.leaseToken,
      attempt_count: 2,
    })
    await completeRefundReconciliation(second!)
    expect(await getMembershipOperationExecutionWork(id)).toBeNull()
    expect(await leaseDueRefundReconciliation(id)).toBeNull()
  })
})
