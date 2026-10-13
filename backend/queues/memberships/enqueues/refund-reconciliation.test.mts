import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import { memberships } from '../queues.mts'
import {
  enqueueDispatchMembershipRefundReconciliation,
  enqueueReconcileMembershipRefundOperation,
  enqueueReconcileMembershipRefundOperationBestEffort,
} from './refund-reconciliation.mts'

describe('refund reconciliation enqueues', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses durable operation and lease identities', async () => {
    const operationId = randomUUID()
    const leaseToken = randomUUID()
    const deduplicationId = `refund-dispatch-test-${randomUUID()}`
    const dispatch = await enqueueDispatchMembershipRefundReconciliation({ deduplicationId })
    const reconciliation = await enqueueReconcileMembershipRefundOperation({
      operationId,
      leaseToken,
    })
    const child = await readEnqueuedJob(memberships, reconciliation)

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
    const dispatcher = await readEnqueuedJob(memberships, dispatch)
    expect(dispatcher).toMatchObject({
      name: 'dispatchMembershipRefundReconciliation',
      opts: { deduplication: { id: deduplicationId, mode: 'throttle', ttl: 300_000 } },
    })
    expect(dispatcher.data).toStrictEqual({})
  })

  it('exposes completion of the best-effort reconciliation enqueue', async () => {
    const operationId = randomUUID()
    const leaseToken = randomUUID()
    const completion = enqueueReconcileMembershipRefundOperationBestEffort({
      operationId,
      leaseToken,
    })

    await completion
    expect(
      await memberships.getJob(`membership-refund-reconciliation__${operationId}__${leaseToken}`),
    ).toMatchObject({
      data: { operationId, leaseToken },
      name: 'reconcileMembershipRefundOperation',
    })
  })
})
