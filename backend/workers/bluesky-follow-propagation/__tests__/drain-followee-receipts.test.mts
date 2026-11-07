import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUserDirect, insertTestBlueskyLinkedAccount } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import {
  getBlueskyFollowReceipt,
  saveBlueskyFollowReceipt,
  drainBlueskyFolloweeReceiptsPage,
} from '@services/bluesky-follows'
import { blueskyFollowsWorkConfig } from '@services/bluesky-follows/work-limits'
import { BLUESKY_FOLLOW_PROPAGATION_DRAIN_FOLLOWEE_RECEIPTS_JOB } from '@queues/background/enqueues/bluesky-follow-propagation-jobs'
import { drainFolloweeReceipts } from '../processors.mts'

async function followerReceipt(followeeId: string) {
  const follower = await createTestUserDirect()
  const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
  await saveBlueskyFollowReceipt(
    follower.id,
    followeeId,
    account.bluesky_did,
    account.link_authorization_id,
    `at://${account.bluesky_did}/app.bsky.graph.follow/${follower.id.slice(0, 13)}`,
  )
  return { id: follower.id, account }
}

async function hasReceipt(follower: Awaited<ReturnType<typeof followerReceipt>>, target: string) {
  return Boolean(
    await getBlueskyFollowReceipt(
      follower.id,
      target,
      follower.account.bluesky_did,
      follower.account.link_authorization_id,
    ),
  )
}

describe('draining other followers receipts after a disconnect', () => {
  it('clears one page, enqueues the continuation, and the job finishes the rest', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    const target = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: target.id })
    const followers = await Promise.all([followerReceipt(target.id), followerReceipt(target.id)])

    await drainBlueskyFolloweeReceiptsPage(target.id, null)

    const present = await Promise.all(followers.map(follower => hasReceipt(follower, target.id)))
    expect(present.filter(Boolean)).toHaveLength(1)
    const deleted = followers[present.indexOf(false)]!
    const remaining = followers[present.indexOf(true)]!
    const continuation = await backgroundQueue.getJob(
      `drain_followee_receipts__${target.id}__${deleted.id}`,
    )
    expect(continuation?.name).toBe(BLUESKY_FOLLOW_PROPAGATION_DRAIN_FOLLOWEE_RECEIPTS_JOB.name)
    expect(continuation?.data).toEqual({ userId: target.id, after: deleted.id })

    await drainFolloweeReceipts({ userId: target.id, after: deleted.id })
    expect(await hasReceipt(remaining, target.id)).toBe(false)
  })
})
