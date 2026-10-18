import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isDeduplicatedEnqueue, readEnqueuedJob } from '@voucha/test-helpers'
import { holdBackgroundDomain } from '../../../../test-helpers/shared-background-worker.mts'
import { runInsideTestWorkerProcessor as withoutFlush } from '@vouchington/worker-runtime/testing'
import { voteAggregation } from '../queues.mts'
import {
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
  enqueueVoteWeightDirtyMarkers,
} from './vote-weight.mts'

const window = {
  windowStart: '2026-01-01T00:00:00.000000Z',
  windowEnd: '2026-01-02T00:00:00.000000Z',
}

async function admitSameAndDistinct<T>(
  enqueue: (data: T) => Promise<unknown>,
  data: T,
  distinctData: T,
) {
  return {
    first: await enqueue(data),
    duplicate: await enqueue(data),
    distinct: await enqueue(distinctData),
  }
}

const dispatchers = [
  {
    name: 'age milestones',
    backfillId: 'vote-weight-age-milestones',
    root: (deduplicationId: string) => enqueueVoteWeightAgeMilestones({}, { deduplicationId }),
    continuation: () => enqueueVoteWeightAgeMilestones({ window, afterId: randomUUID() }),
    rootData: {},
    continuationData: { window },
    admissions: () => {
      const data = { window, afterId: randomUUID() }
      return admitSameAndDistinct(enqueueVoteWeightAgeMilestones, data, {
        ...data,
        afterId: randomUUID(),
      })
    },
  },
  {
    name: 'membership expirations',
    backfillId: 'vote-weight-membership-expirations',
    root: (deduplicationId: string) =>
      enqueueVoteWeightMembershipExpirations({}, { deduplicationId }),
    continuation: () =>
      enqueueVoteWeightMembershipExpirations({
        window,
        after: { at: window.windowStart, id: randomUUID() },
      }),
    rootData: {},
    continuationData: { window },
    admissions: () => {
      const data = { window, after: { at: window.windowStart, id: randomUUID() } }
      return admitSameAndDistinct(enqueueVoteWeightMembershipExpirations, data, {
        ...data,
        after: { ...data.after, id: randomUUID() },
      })
    },
  },
  {
    name: 'family source changes',
    backfillId: 'vote-weight-family-source-changes',
    root: (deduplicationId: string) =>
      enqueueVoteWeightFamilySourceChanges({}, { deduplicationId }),
    continuation: () =>
      enqueueVoteWeightFamilySourceChanges({
        window,
        branches: { updated_at: { at: window.windowStart, id: randomUUID() } },
      }),
    rootData: {},
    continuationData: { window },
    admissions: () => {
      const id = randomUUID()
      const data = {
        window,
        branches: { rejected_at: { at: window.windowStart, id, afterSourceId: randomUUID() } },
      }
      return admitSameAndDistinct(enqueueVoteWeightFamilySourceChanges, data, {
        ...data,
        branches: { rejected_at: { ...data.branches.rejected_at, afterSourceId: randomUUID() } },
      })
    },
  },
  {
    name: 'dirty markers',
    backfillId: 'vote-weight-dirty-markers',
    root: (deduplicationId: string) => enqueueVoteWeightDirtyMarkers({}, { deduplicationId }),
    continuation: () => enqueueVoteWeightDirtyMarkers({ afterId: randomUUID() }),
    rootData: {},
    continuationData: { afterId: expect.any(String) },
    admissions: () => {
      const data = { afterId: randomUUID() }
      return admitSameAndDistinct(enqueueVoteWeightDirtyMarkers, data, { afterId: randomUUID() })
    },
  },
]

describe('vote-weight dispatcher admission', () => {
  it.each(dispatchers)(
    '$name throttles operator roots but admits continuations',
    async dispatcher => {
      const deduplicationId = `backfill:${dispatcher.backfillId}:${randomUUID()}`
      const root = await readEnqueuedJob(voteAggregation, await dispatcher.root(deduplicationId))
      try {
        expect(root.data).toMatchObject(dispatcher.rootData)
        expect(root.opts.deduplication).toEqual({
          id: deduplicationId,
          mode: 'throttle',
          ttl: 3_600_000,
        })

        expect(isDeduplicatedEnqueue(await dispatcher.root(deduplicationId))).toBe(true)

        const continuation = await readEnqueuedJob(voteAggregation, await dispatcher.continuation())
        try {
          expect(continuation.data).toMatchObject(dispatcher.continuationData)
          expect(continuation.opts.deduplication).toBeUndefined()
        } finally {
          await continuation.remove()
        }
      } finally {
        await root.remove()
      }
    },
  )

  it.each(dispatchers)(
    '$name admits one live continuation per complete cursor state',
    async dispatcher => {
      const release = holdBackgroundDomain('vote-aggregation')
      const admittedJobs: Array<{ remove: () => Promise<unknown> }> = []
      try {
        const { first, duplicate, distinct } = await withoutFlush(dispatcher.admissions)
        const admitted = await readEnqueuedJob(voteAggregation, first)
        admittedJobs.push(admitted)
        expect(isDeduplicatedEnqueue(duplicate)).toBe(true)
        expect((await voteAggregation.getJob(admitted.id))?.timestamp).toBe(admitted.timestamp)
        const other = await readEnqueuedJob(voteAggregation, distinct)
        admittedJobs.push(other)
        expect(other.id).not.toBe(admitted.id)
      } finally {
        try {
          await Promise.all(admittedJobs.map(job => job.remove()))
        } finally {
          await release()
        }
      }
    },
  )

  it('distinguishes unstarted and completed family branches', async () => {
    const release = holdBackgroundDomain('vote-aggregation')
    const admittedJobs: Array<{ remove: () => Promise<unknown> }> = []
    try {
      const unstarted = await readEnqueuedJob(
        voteAggregation,
        await withoutFlush(() => enqueueVoteWeightFamilySourceChanges({ window, branches: {} })),
      )
      admittedJobs.push(unstarted)
      const completed = await readEnqueuedJob(
        voteAggregation,
        await withoutFlush(() =>
          enqueueVoteWeightFamilySourceChanges({ window, branches: { rejected_at: null } }),
        ),
      )
      admittedJobs.push(completed)
      expect(completed.id).not.toBe(unstarted.id)
    } finally {
      try {
        await Promise.all(admittedJobs.map(job => job.remove()))
      } finally {
        await release()
      }
    }
  })

  it('reactivates a finished continuation with the same stable id', async () => {
    const data = { afterId: `ffffffff-ffff-4fff-8fff-${randomUUID().slice(24)}` }
    const first = await readEnqueuedJob(voteAggregation, await enqueueVoteWeightDirtyMarkers(data))
    await expect((await voteAggregation.getJob(first.id))?.getState()).resolves.toBe('completed')

    const replay = await readEnqueuedJob(voteAggregation, await enqueueVoteWeightDirtyMarkers(data))
    expect(replay.id).toBe(first.id)
  })
})
