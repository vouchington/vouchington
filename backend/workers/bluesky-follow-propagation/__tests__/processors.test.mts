import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  insertTestBlueskyLinkedAccount,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { blueskyFollowsWorkConfig } from '@services/bluesky-follows/work-limits'
import { requestBlueskyDisconnect } from '@services/bluesky-follows'
import {
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
} from '@queues/background/enqueues/bluesky-follow-propagation-jobs'

import {
  backfillBlueskyDisconnectRequests,
  backfillBlueskyFollowPropagation,
} from '../processors.mts'

const START_OF_IDS = '00000000-0000-0000-0000-000000000000'
const LAST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

describe('bluesky follow propagation worker processors', () => {
  it('enqueues a full candidate page and continues from its last pair', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 2 }),
    )
    const [follower, firstFollowee, secondFollowee] = await Promise.all(
      [1, 2, 3].map(() => createTestUserDirect()),
    )
    await Promise.all(
      [follower!, firstFollowee!, secondFollowee!].map(user =>
        insertTestBlueskyLinkedAccount({ userId: user.id }),
      ),
    )
    await Promise.all([
      insertTestLocalFollow(follower!.id, firstFollowee!.id),
      insertTestLocalFollow(follower!.id, secondFollowee!.id),
    ])
    const followeeIds = [firstFollowee!.id, secondFollowee!.id].toSorted()
    const pairs = followeeIds.map(followeeUserId => ({
      followerUserId: follower!.id,
      followeeUserId,
    }))

    const result = await backfillBlueskyFollowPropagation({
      followerUserId: uuidBefore(follower!.id),
      followeeUserId: START_OF_IDS,
    })

    expect(result).toEqual({ enqueued: 2, hasMore: true })
    for (const pair of pairs) {
      const jobs = await backgroundQueue.searchJobs({
        name: BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB.name,
        data: pair,
      })
      expect(jobs.map(job => job.data)).toEqual([pair])
    }
    const continuation = await backgroundQueue.getJob(
      `backfill_bluesky_follow_propagation__${follower!.id}__${followeeIds[1]}`,
    )
    expect(continuation?.data).toEqual({ after: pairs[1] })
  })

  it('enqueues nothing past the last possible candidate cursor', async () => {
    await expect(
      backfillBlueskyFollowPropagation({ followerUserId: LAST_ID, followeeUserId: LAST_ID }),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
    await expect(backfillBlueskyDisconnectRequests(LAST_ID)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
  })

  it('enqueues a full disconnect page and continues from its last authorization id', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const request = await requestBlueskyDisconnect(user.id)

    await expect(
      backfillBlueskyDisconnectRequests(uuidBefore(linked.link_authorization_id)),
    ).resolves.toEqual({ enqueued: 1, hasMore: true })

    expect(request).toEqual({
      userId: user.id,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    })
    const job = await backgroundQueue.getJob(
      `disconnect_${user.id}_${linked.link_authorization_id}`,
    )
    expect(job?.name).toBe(BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB.name)
    expect(job?.data).toEqual(request)
    const continuation = await backgroundQueue.getJob(
      `backfill_bluesky_disconnect_requests__${linked.link_authorization_id}`,
    )
    expect(continuation?.data).toEqual({ afterId: linked.link_authorization_id })
  })
})
