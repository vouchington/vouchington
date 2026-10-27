import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { insertUndispatchedTestUserFollow } from '@voucha/test-helpers/activitypub-distribution-state'
import { insertPostElectionVote } from '@voucha/test-helpers/entities/post-election-votes'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import {
  listPendingOutboundDistributionPage,
  markActivityDistributionComplete,
} from '@services/activitypub-delivery'
import type { DistributeActivityData } from '@queues/background/enqueues/activitypub-domain'
import { distributeActivity } from './delivery.mts'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

// processDistributeActivityJob settles the domain row exactly when distributeActivity completes.
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
      markdown: 'A public post whose Like predates the maximum activity age',
    })
    const expiredId = () =>
      getMinUUIDv7ForDate(new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * 86_400_000))
    const followId = await insertUndispatchedTestUserFollow(source.id, target.id, expiredId())
    const likeId = expiredId()
    await insertPostElectionVote(source.id, postId, 1, likeId)

    const followCursor = `${source.id}__${ZERO_UUID}`
    const likeCursor = `${postId}__${ZERO_UUID}`
    const pendingFollow = async () =>
      (await listPendingOutboundDistributionPage('follows', followCursor, 1)).rows.find(
        row => row.sourceUserId === source.id,
      )
    const pendingLike = async () =>
      (await listPendingOutboundDistributionPage('votes', likeCursor, 1)).rows.find(
        row => row.source === 'votes' && row.activityId === likeId,
      )
    expect(await pendingFollow()).toBeDefined()
    expect(await pendingLike()).toBeDefined()

    await settleLikeTheDistributeProcessor({
      activityType: 'Follow',
      activityId: followId,
      sourceUserId: source.id,
      targetUserId: target.id,
      recovery: true,
    })
    await settleLikeTheDistributeProcessor({
      activityType: 'Like',
      activityId: likeId,
      sourceUserId: source.id,
      targetPostId: postId,
      recovery: true,
    })

    expect(await pendingFollow()).toBeUndefined()
    expect(await pendingLike()).toBeUndefined()
  })
})
