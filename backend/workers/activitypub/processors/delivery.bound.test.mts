import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { insertUndispatchedTestUserFollow } from '@voucha/test-helpers/activitypub-distribution-state'
import { insertPendingOutboundLikeForTest } from '@voucha/test-helpers/entities/post-election-votes'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import {
  listPendingOutboundDistributionPage,
  markActivityDistributionComplete,
} from '@services/activitypub-delivery'
import type { DistributeActivityData } from '@queues/background/enqueues/activitypub-domain'
import { distributeActivity } from './delivery.mts'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
async function settleLikeTheDistributeProcessor(data: DistributeActivityData) {
  const result = await distributeActivity(data)
  expect(result).toMatchObject({ enqueued: 0, completed: true, reason: 'expired-activity' })
  await markActivityDistributionComplete(data)
}

describe('expired outbound activities and recovery sweeps', () => {
  it('settles an expired pending Follow and Like so a recovery sweep never redistributes them', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: source.id,
      title: 'Expired outbound activity recovery',
      slug: `expired-outbound-recovery-${randomUUID()}`,
      markdown: 'Expired Like',
    })
    const expiredId = () =>
      getMinUUIDv7ForDate(new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * 86_400_000))
    const followId = await insertUndispatchedTestUserFollow(source.id, target.id, expiredId())
    const likeId = expiredId()
    await insertPendingOutboundLikeForTest(source.id, postId, likeId)
    const page = (kind: 'follows' | 'votes', owner: string) =>
      listPendingOutboundDistributionPage(kind, `${owner}__${ZERO_UUID}`, 50)
    const pendingFollow = async () =>
      (await page('follows', source.id)).rows.find(row => row.sourceUserId === source.id)
    const pendingLike = async () =>
      (await page('votes', postId)).rows.find(
        row => row.source === 'votes' && row.activityId === likeId,
      )
    expect(await pendingFollow()).toBeDefined()
    expect(await pendingLike()).toBeDefined()
    const [sourceUserId, recovery] = [source.id, true as const]
    await settleLikeTheDistributeProcessor({
      ...{ activityType: 'Follow' as const, activityId: followId, targetUserId: target.id },
      ...{ sourceUserId, recovery },
    })
    await settleLikeTheDistributeProcessor({
      ...{ activityType: 'Like' as const, activityId: likeId, targetPostId: postId },
      ...{ sourceUserId, recovery },
    })
    expect(await pendingFollow()).toBeUndefined()
    expect(await pendingLike()).toBeUndefined()
  })
})
