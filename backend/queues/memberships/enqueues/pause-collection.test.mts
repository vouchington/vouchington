import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import { memberships } from '../queues.mts'
import {
  enqueueDispatchMembershipPauseCollection,
  enqueueSyncMembershipPauseCollection,
} from './pause-collection.mts'

describe('pause collection enqueues', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the suspension generation and lease as the job identity', async () => {
    const userId = randomUUID()
    const requestedAt = '2026-10-11T00:00:00.000Z'
    const leaseToken = randomUUID()
    const requestedAtMs = Date.parse(requestedAt)
    const sync = await enqueueSyncMembershipPauseCollection({ userId, requestedAt, leaseToken })
    const child = await readEnqueuedJob(memberships, sync)

    expect(child).toMatchObject({
      name: 'syncMembershipPauseCollection',
      data: { userId, requestedAt, leaseToken },
      opts: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        deduplication: {
          id: `membership-pause-collection__${userId}__${requestedAtMs}__${leaseToken}`,
          mode: 'simple',
        },
        ordering: { key: `pause-collection:${userId}`, concurrency: 1 },
      },
    })

    const dispatch = await enqueueDispatchMembershipPauseCollection()
    const dispatcher = await readEnqueuedJob(memberships, dispatch)
    expect(dispatcher).toMatchObject({
      id: `membership-pause-collection-dispatch__${Math.floor(Date.now() / 60_000)}`,
      name: 'dispatchMembershipPauseCollection',
      data: {},
      opts: {
        deduplication: {
          id: 'membership-pause-collection-dispatch',
          mode: 'throttle',
          ttl: 60_000,
        },
      },
    })
  })
})
