import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  MODERATION_SIGNALS_BAN_EVASION_JOB,
  MODERATION_SIGNALS_SPAM_DETECTION_JOB,
} from '@queues/background/enqueues/moderation-signals-jobs'
import type { Community } from '@services/communities/types'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { moderationSignalsHandlers } from './workers.mts'

const [spamHandler, banEvasionHandler] = moderationSignalsHandlers

const asJob = (data: object) => ({ data }) as Job

describe('moderation-signals handlers', () => {
  let community: Community

  beforeAll(async () => {
    const owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('pairs each handler with its own registered job', () => {
    expect(spamHandler!.job).toBe(MODERATION_SIGNALS_SPAM_DETECTION_JOB)
    expect(banEvasionHandler!.job).toBe(MODERATION_SIGNALS_BAN_EVASION_JOB)
  })

  it('rejects a spam-detection job without a post id', async () => {
    await expect(spamHandler!.handle(asJob({ id: '' }))).rejects.toThrow(
      'Spam detection job requires id in job.data',
    )
  })

  it('skips a missing or stale post without applying a result', async () => {
    const result = await spamHandler!.handle(
      asJob({ id: randomUUID(), contentSha256: Buffer.alloc(32, 4).toString('hex') }),
    )

    expect(result).toEqual({ success: true, applied: false })
  })

  it.each([
    { communityId: '', userId: 'user-1' },
    { communityId: 'community-1', userId: '' },
  ])('rejects a ban-evasion job missing an id: %j', async data => {
    await expect(banEvasionHandler!.handle(asJob(data))).rejects.toThrow(
      'Ban evasion job requires communityId and userId in job.data',
    )
  })

  it('detects for a valid member with no posts', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await expect(
      banEvasionHandler!.handle(asJob({ communityId: community.id, userId: member.id })),
    ).resolves.toEqual({ success: true })
  })
})
