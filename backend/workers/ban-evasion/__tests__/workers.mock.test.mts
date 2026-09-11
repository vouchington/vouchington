import { describe, it, expect, type Mock, vi, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

const workerMock = vi.hoisted(
  () =>
    vi.fn<typeof import('glide-mq').Worker>() as Mock<typeof import('glide-mq').Worker> &
      typeof import('glide-mq').Worker,
)

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: workerMock,
}))

import { handleBanEvasionJob } from '../workers.mts'

describe('handleBanEvasionJob', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('throws when communityId is missing', async () => {
    const job = { data: { communityId: '', userId: 'user-1' } }
    await expect(handleBanEvasionJob(job as any)).rejects.toThrow(
      'Ban evasion job requires communityId and userId in job.data',
    )
  })

  it('throws when userId is missing', async () => {
    const job = { data: { communityId: 'community-1', userId: '' } }
    await expect(handleBanEvasionJob(job as any)).rejects.toThrow(
      'Ban evasion job requires communityId and userId in job.data',
    )
  })

  it('returns { success: true } for a valid member with no posts', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const job = { data: { communityId: community.id, userId: member.id } }
    const result = await handleBanEvasionJob(job as any)
    expect(result).toEqual({ success: true })
  })
})
