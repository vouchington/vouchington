import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isDeduplicatedEnqueue, readEnqueuedJob } from '@voucha/test-helpers'
import { voteAggregation } from '../queues.mts'
import {
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
  enqueueVoteWeightDirtyMarkers,
} from './vote-weight.mts'

const window = {
  previousThroughAt: null,
  windowStart: '2026-01-01T00:00:00.000000Z',
  windowEnd: '2026-01-02T00:00:00.000000Z',
}

const dispatchers = [
  {
    name: 'age milestones',
    backfillId: 'vote-weight-age-milestones',
    root: (deduplicationId: string) =>
      enqueueVoteWeightAgeMilestones({ fullReplay: true }, { deduplicationId }),
    continuation: () =>
      enqueueVoteWeightAgeMilestones({ fullReplay: true, window, afterId: randomUUID() }),
    rootData: { fullReplay: true },
    continuationData: { fullReplay: true, window },
  },
  {
    name: 'membership expirations',
    backfillId: 'vote-weight-membership-expirations',
    root: (deduplicationId: string) =>
      enqueueVoteWeightMembershipExpirations({ fullReplay: true }, { deduplicationId }),
    continuation: () =>
      enqueueVoteWeightMembershipExpirations({
        fullReplay: true,
        window,
        after: { at: window.windowStart, id: randomUUID() },
      }),
    rootData: { fullReplay: true },
    continuationData: { fullReplay: true, window },
  },
  {
    name: 'family source changes',
    backfillId: 'vote-weight-family-source-changes',
    root: (deduplicationId: string) =>
      enqueueVoteWeightFamilySourceChanges({ fullReplay: true }, { deduplicationId }),
    continuation: () =>
      enqueueVoteWeightFamilySourceChanges({
        fullReplay: true,
        window,
        branches: { updated_at: { at: window.windowStart, id: randomUUID() } },
      }),
    rootData: { fullReplay: true },
    continuationData: { fullReplay: true, window },
  },
  {
    name: 'dirty markers',
    backfillId: 'vote-weight-dirty-markers',
    root: (deduplicationId: string) => enqueueVoteWeightDirtyMarkers({}, { deduplicationId }),
    continuation: () => enqueueVoteWeightDirtyMarkers({ afterId: randomUUID() }),
    rootData: {},
    continuationData: { afterId: expect.any(String) },
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
})
