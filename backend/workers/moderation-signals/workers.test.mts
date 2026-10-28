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

  it('rejects a spam-detection job without a version id', async () => {
    await expect(spamHandler!.handle(asJob({ versionId: '' }))).rejects.toThrow(
      'Spam detection job requires versionId in job.data',
    )
  })

  it('skips a missing version without applying a result', async () => {
    const result = await spamHandler!.handle(asJob({ versionId: randomUUID() }))

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
