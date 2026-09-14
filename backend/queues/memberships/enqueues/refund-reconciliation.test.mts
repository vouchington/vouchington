import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '../../../test-helpers/queue-jobs.mts'
import { memberships } from '../queues.mts'
import {
  enqueueDispatchMembershipRefundReconciliation,
  enqueueReconcileMembershipRefundOperation,
  enqueueReconcileMembershipRefundOperationBestEffort,
} from './refund-reconciliation.mts'

const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('refund reconciliation enqueues', () => {
  it('uses durable operation and lease identities', async () => {
    await memberships.obliterate({ force: true })
    const operationId = randomUUID()
    const leaseToken = randomUUID()
    try {
      await enqueueDispatchMembershipRefundReconciliation()
      await enqueueReconcileMembershipRefundOperation({ operationId, leaseToken })
      const jobs = (
        await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state, 0, -1)))
      ).flat()
      const child = jobs.find(job => job.name === 'reconcileMembershipRefundOperation')
      expect(child).toMatchObject({
        data: { operationId, leaseToken },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
          deduplication: {
            id: `membership-refund-reconciliation__${operationId}__${leaseToken}`,
            mode: 'simple',
          },
        },
      })
      expect(
        jobs.find(job => job.name === 'dispatchMembershipRefundReconciliation')?.data,
      ).toStrictEqual({})
    } finally {
      await memberships.obliterate({ force: true })
    }
  })

  it('fires the reconciliation enqueue without requiring a caller await', async () => {
    const operationId = randomUUID()
    const leaseToken = randomUUID()

    try {
      enqueueReconcileMembershipRefundOperationBestEffort({ operationId, leaseToken })

      await expect
        .poll(async () => readAllQueueJobs(memberships), { timeout: 5_000 })
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              data: { operationId, leaseToken },
              name: 'reconcileMembershipRefundOperation',
            }),
          ]),
        )
    } finally {
      await memberships.obliterate({ force: true })
    }
  })
})
