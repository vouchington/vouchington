import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { claimAdministratorRefundRequest } from '@services/memberships'
import { createTestMembership, createTestSku, createTestUser } from '@voucha/test-helpers'
import { cleanupRefundReconciliationOperationsForTest } from '@voucha/test-helpers/entities/membership-refund-reconciliation-state'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import { interceptPostgresTransactionsForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { memberships } from '@queues/memberships/queues'
import { leaseAndEnqueueRefundReconciliations } from './event-charge-handlers.mts'

const applicationId = `stripe-refund-lease-wake-${randomUUID()}`

async function createDueRefundOperation(administratorId: string) {
  const user = await createTestUser()
  const sku = await createTestSku({
    provider_application_id: applicationId,
    provider_environment: 'test',
  })
  const membership = await createTestMembership({
    user_id: user.id,
    sku_id: sku.id,
    stripe_subscription_id: `sub_wake_${randomUUID()}`,
    provider_application_id: applicationId,
    provider_environment: 'test',
  })
  return claimAdministratorRefundRequest({
    amount: { amount: 1000, currency: 'usd' },
    cancelRequested: false,
    idempotencyKey: randomUUID(),
    issuedById: administratorId,
    membershipId: membership.id,
    note: null,
    periodEndsAt: null,
    periodStartedAt: null,
    providerPaymentReference: `ch_wake_${randomUUID()}`,
    providerSubscriptionReference: null,
    reason: 'other',
    requestFingerprint: randomUUID().replaceAll('-', '').repeat(2),
  })
}

describe('refund reconciliation wake', () => {
  it('admits the granted lease to the queue before surfacing another lease failure', async () => {
    const administrator = await createTestUser({ administrator: true })
    const failed = await createDueRefundOperation(administrator.id)
    const granted = await createDueRefundOperation(administrator.id)
    onTestFinished(() => cleanupRefundReconciliationOperationsForTest([failed.id, granted.id]))
    const failure = new Error('injected lease failure')
    const restore = interceptPostgresTransactionsForTest(transaction =>
      rejectQuery(
        transaction,
        (statement, values) =>
          statement.includes('claimMembershipOperationExecutionWork') && values.includes(failed.id),
        failure,
      ),
    )
    onTestFinished(restore)

    await expect(leaseAndEnqueueRefundReconciliations([failed.id, granted.id])).rejects.toBe(
      failure,
    )

    const jobs = await readAllQueueJobs(memberships)
    const wakeJobs = jobs.filter(
      job =>
        job.name === 'reconcileMembershipRefundOperation' &&
        [failed.id, granted.id].includes((job.data as { operationId: string }).operationId),
    )
    expect(wakeJobs).toHaveLength(1)
    const [wakeJob] = wakeJobs
    const { operationId, leaseToken } = wakeJob.data as { operationId: string; leaseToken: string }
    expect(operationId).toBe(granted.id)
    expect(wakeJob.id).toBe(`membership-refund-reconciliation__${granted.id}__${leaseToken}`)
  })
})
