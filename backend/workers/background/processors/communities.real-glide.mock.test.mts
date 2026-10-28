import {
  closeAndUnregisterGlideMQInstance,
  createQueue,
  createWorker,
} from '@data-stores/valkey-glide-mq'
import { randomUUID } from 'node:crypto'
import { getBackgroundOrderingConcurrency } from '@queues/background/config'
import { createCommunityMemberMetricEnqueue } from '@queues/background/enqueues/communities'
import { COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB } from '@queues/background/enqueues/communities-jobs'
import { communitiesWorkConfig } from '@services/communities/work-limits'
import { caches } from '@services/entity-cache/caches'
import { getUserMetricsByAnyCached } from '@services/entity-fetch/metrics'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { trackUserMetricsFills } from '../../../test-helpers/user-metrics-cache-fills.mts'
import { createBackgroundProcessor } from '../processors.mts'
import { createCommunitiesHandlers } from './communities-handler-factory.mts'
import { buildHandlerMap } from './handler-map.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('community member metric invalidation background handler', () => {
  it('walks bounded pages through the real worker and replays the same stable job ids', async ({
    signal,
  }) => {
    const restore = overrideDynamicConfigFieldsForTest(communitiesWorkConfig, {
      member_metric_invalidation_page_size: 1,
    })
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const memberMembership = await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
    })
    await warmUserMetricsCaches([owner.id, member.id])

    const firstPass = Promise.withResolvers<void>()
    const replay = Promise.withResolvers<void>()
    const rejectPhasesOnAbort = () => {
      const error = signal.reason ?? new Error('Community metric invalidation test aborted')
      firstPass.reject(error)
      replay.reject(error)
    }
    signal.addEventListener('abort', rejectPhasesOnAbort, { once: true })
    void firstPass.promise.catch(() => {})
    void replay.promise.catch(() => {})
    const completed: Job[] = []
    const queue = createQueue(`community-member-metrics-${randomUUID()}`, {
      priorityKind: 'ranked',
      orderingConcurrency: getBackgroundOrderingConcurrency,
    })
    const enqueue = createCommunityMemberMetricEnqueue(queue)
    const worker = createWorker(
      queue.name,
      createBackgroundProcessor(
        buildHandlerMap(createCommunitiesHandlers(enqueue), ['communities']),
      ),
      {
        concurrency: 1,
        blockTimeout: 100,
        promotionInterval: 100,
        dedicatedCommandClient: true,
      },
    )
    worker.on('completed', job => {
      if (job.data.communityId !== community.id) return
      completed.push(job)
      if (completed.length === 3) firstPass.resolve()
      if (completed.length === 6) replay.resolve()
    })
    worker.on('failed', (job, error) => {
      if (job?.data?.communityId === community.id) {
        firstPass.reject(error)
        replay.reject(error)
      }
    })
    worker.on('error', error => {
      firstPass.reject(error)
      replay.reject(error)
    })

    try {
      await worker.waitUntilReady()
      const rootData = {
        communityId: community.id,
        generation: randomUUID(),
        minimumReplayLsn: '0/0',
        upperBoundMembershipId: memberMembership.id,
      }
      await enqueue(rootData)
      await firstPass.promise

      const firstIds = completed.map(job => job.id)
      expect(new Set(firstIds).size).toBe(3)
      expect(firstIds.filter(id => id.includes('__root'))).toHaveLength(1)
      const ordering = COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB.options.ordering
      if (!ordering) throw new Error('Community invalidation jobs must define ordering')
      expect(completed.map(job => job.opts.ordering)).toEqual(
        Array.from({ length: 3 }, () => ({
          ...ordering,
          concurrency: getBackgroundOrderingConcurrency(ordering.key),
        })),
      )
      await expect(caches.user_metrics.get(owner.id)).resolves.toBeNull()
      await expect(caches.user_metrics.get(member.id)).resolves.toBeNull()

      await enqueue(rootData)
      await replay.promise

      expect(completed.slice(3).map(job => job.id)).toEqual(firstIds)
    } finally {
      signal.removeEventListener('abort', rejectPhasesOnAbort)
      restore()
      await closeAndUnregisterGlideMQInstance(worker)
      await queue.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(queue)
    }
  })
})

async function warmUserMetricsCaches(userIds: string[]): Promise<void> {
  const pending: Promise<unknown>[] = []
  const stop = trackUserMetricsFills(caches.user_metrics, pending)
  try {
    await Promise.all(
      userIds.map(userId =>
        expect(getUserMetricsByAnyCached(userId)).resolves.toMatchObject({
          count: { communities_member: 1 },
        }),
      ),
    )
    await Promise.all(pending)
  } finally {
    stop()
  }
}
