import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
} from '@queues/background/enqueues/bluesky-follow-propagation-jobs'
import { blueskyFollowPropagationHandlers } from './workers.mts'

const LAST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function run(name: string, data: object) {
  const handler = blueskyFollowPropagationHandlers.find(candidate => candidate.job.name === name)!
  const job = { data, timestamp: Date.now(), moveToDelayed: () => Promise.resolve() }
  return handler.handle(job as unknown as Job)
}

describe('Bluesky follow propagation background handlers', () => {
  it('reconciles a pair that has no Bluesky link as a no-op', async () => {
    await expect(
      run(BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB.name, {
        followerUserId: randomUUID(),
        followeeUserId: randomUUID(),
      }),
    ).resolves.toBeUndefined()
  })

  it('treats a disconnect for a generation that no longer exists as a no-op', async () => {
    await expect(
      run(BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB.name, {
        userId: randomUUID(),
        blueskyDid: 'did:plc:gone',
        linkAuthorizationId: randomUUID(),
      }),
    ).resolves.toBeUndefined()
  })

  it('backfills follows after the cursor pair carried by the job', async () => {
    await expect(
      run(BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB.name, {
        after: { followerUserId: LAST_ID, followeeUserId: LAST_ID },
      }),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
  })

  it('backfills disconnects after the authorization id carried by the job', async () => {
    await expect(
      run(BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB.name, { afterId: LAST_ID }),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
  })
})
