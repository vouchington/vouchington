import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestModerationReport,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { claimModerationQueueItem } from '../create.mts'
import { attachReportClaims, attachPostClaims } from '../get.mts'

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

describe('attachReportClaims', () => {
  let mod: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    mod = await createTestUser()
    postAuthor = await createTestUser()
    reporter = await createTestUser()
  })

  it('attaches active claim to entries that have a live claim', async () => {
    const community = await createTestCommunity(mod.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `attach-claims-active-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Attach Claims Active',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await claimModerationQueueItem(mod.id, { communityId: community.id, reportId })
    const result = await attachReportClaims([{ id: reportId }])

    expect(result).toHaveLength(1)
    expect(result[0]!.claim).not.toBeNull()
    expect(result[0]!.claim?.claimed_by_id).toBe(mod.id)
  })

  it('returns null claim when no active claim exists', async () => {
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `attach-claims-none-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Attach Claims None',
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const result = await attachReportClaims([{ id: reportId }])

    expect(result).toHaveLength(1)
    expect(result[0]!.claim).toBeNull()
  })

  it('returns empty array when passed empty entries', async () => {
    const result = await attachReportClaims([])
    expect(result).toEqual([])
  })
})

describe('attachPostClaims', () => {
  let mod: PrivateUser
  let postAuthor: PrivateUser

  beforeAll(async () => {
    mod = await createTestUser()
    postAuthor = await createTestUser()
  })

  it('attaches active claim to post entries that have a live claim', async () => {
    const community = await insertTestCommunity({ createdById: mod.id })
    await insertTestCommunityMember({ communityId: community.id, userId: mod.id, role: 'owner' })
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `attach-post-claims-active-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Attach Post Claims Active',
      markdown: 'body',
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    await claimModerationQueueItem(mod.id, { communityId: community.id, postId })
    const result = await attachPostClaims([{ id: postId }])

    expect(result).toHaveLength(1)
    expect(result[0]!.claim).not.toBeNull()
    expect(result[0]!.claim?.claimed_by_id).toBe(mod.id)
  })

  it('returns null claim when no active post claim exists', async () => {
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `attach-post-claims-none-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Attach Post Claims None',
      markdown: 'body',
    })

    const result = await attachPostClaims([{ id: postId }])

    expect(result).toHaveLength(1)
    expect(result[0]!.claim).toBeNull()
  })

  it('returns empty array when passed empty post entries', async () => {
    const result = await attachPostClaims([])
    expect(result).toEqual([])
  })
})
