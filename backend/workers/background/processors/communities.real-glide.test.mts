import { randomUUID } from 'node:crypto'
import { enqueueInvalidateCommunityMemberUserMetrics } from '@queues/background/enqueues/communities'
import { background } from '@queues/background/queues'
import { communitiesWorkConfig } from '@services/communities/work-limits'
import { caches } from '@services/entity-cache/caches'
import { getUserMetricsByAnyCached } from '@services/entity-fetch/metrics'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it } from 'vitest'
import { trackUserMetricsFills } from '../../../test-helpers/user-metrics-cache-fills.mts'
import { createBackgroundProcessor } from '../processors.mts'
import { communitiesHandlers } from './communities.mts'
import { buildHandlerMap } from './handler-map.mts'

describe('community member metric invalidation background handler', () => {
  it('walks bounded pages through the production queue and replays the same stable job ids', async () => {
    const restore = overrideDynamicConfigFieldsForTest(communitiesWorkConfig, {
      member_metric_invalidation_page_size: 1,
    })
    try {
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
      const process = createBackgroundProcessor(
        buildHandlerMap(communitiesHandlers, ['communities']),
      )
      const rootData = {
        communityId: community.id,
        generation: randomUUID(),
        minimumReplayLsn: '0/0',
        upperBoundMembershipId: memberMembership.id,
      }
      const idPrefix = `invalidateMemberUserMetrics__${community.id}__${rootData.generation}__`

      const walk = async () => {
        await enqueueInvalidateCommunityMemberUserMetrics(rootData)
        const ids: string[] = []
        let id = `${idPrefix}root`
        for (;;) {
          const job = await readEnqueuedJob(background, { id })
          ids.push(job.id)
          expect(job.opts.ordering).toMatchObject({
            key: 'communities:member-metric-invalidation',
          })
          const result = (await process(job)) as {
            nextPageData: { afterMembershipId: string } | null
          }
          if (!result.nextPageData) return ids
          id = `${idPrefix}${result.nextPageData.afterMembershipId}`
        }
      }

      const firstIds = await walk()
      expect(firstIds).toHaveLength(3)
      expect(firstIds[0]).toBe(`${idPrefix}root`)
      await expect(caches.user_metrics.get(owner.id)).resolves.toBeNull()
      await expect(caches.user_metrics.get(member.id)).resolves.toBeNull()
      await expect(walk()).resolves.toEqual(firstIds)
    } finally {
      restore()
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
