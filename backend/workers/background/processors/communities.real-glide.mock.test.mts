import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { enqueueInvalidateCommunityMemberUserMetrics } from '@queues/background/enqueues/communities'
import { COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB } from '@queues/background/enqueues/communities-jobs'
import { background } from '@queues/background/queues'
import { communitiesWorkConfig } from '@services/communities/work-limits'
import { updateCommunity } from '@services/communities/update'
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
import { BACKGROUND_HANDLERS } from './handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('community member metric invalidation background handler', () => {
  it('walks bounded pages through the real worker and replays the same stable job ids', async () => {
    const restore = overrideDynamicConfigFieldsForTest(communitiesWorkConfig, {
      member_metric_invalidation_page_size: 1,
    })
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const ownerMembership = await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    await Promise.all([warmUserMetricsCache(owner.id), warmUserMetricsCache(member.id)])

    const firstPass = Promise.withResolvers<void>()
    const replay = Promise.withResolvers<void>()
    const completed: Job[] = []
    const worker = createBackgroundWorker({
      handlers: BACKGROUND_HANDLERS,
      domains: ['communities'],
    })
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
      await updateCommunity(owner, community.id, { visibility: 'private' }, ownerMembership)
      await firstPass.promise

      const firstIds = completed.map(job => job.id)
      expect(new Set(firstIds).size).toBe(3)
      expect(firstIds.filter(id => id.includes('__root'))).toHaveLength(1)
      await expect(caches.user_metrics.get(owner.id)).resolves.toBeNull()
      await expect(caches.user_metrics.get(member.id)).resolves.toBeNull()

      const root = completed.find(job => job.id.includes('__root'))!
      await enqueueInvalidateCommunityMemberUserMetrics(root.data)
      await replay.promise

      expect(completed.slice(3).map(job => job.id)).toEqual(firstIds)
    } finally {
      restore()
      await closeAndUnregisterGlideMQInstance(worker)
      const owned = await background.searchJobs({
        name: COMMUNITY_MEMBER_METRIC_INVALIDATION_JOB.name,
        data: { communityId: community.id },
      })
      await Promise.all(owned.map(job => job.remove()))
    }
  })
})

async function warmUserMetricsCache(userId: string): Promise<void> {
  const pending: Promise<unknown>[] = []
  const stop = trackUserMetricsFills(caches.user_metrics, pending)
  try {
    await expect(getUserMetricsByAnyCached(userId)).resolves.toMatchObject({
      count: { communities_member: 1 },
    })
    await Promise.all(pending)
  } finally {
    stop()
  }
}
