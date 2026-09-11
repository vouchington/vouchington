import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestModerationReport,
  insertTestPendingCommunityPostReview,
  backdateModQueueClaim,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { claimModerationQueueItem, releaseModerationQueueItem } from '../create.mts'

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

describe('claimModerationQueueItem - report', () => {
  let mod1: PrivateUser
  let mod2: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    mod1 = await createTestUser()
    mod2 = await createTestUser()
    postAuthor = await createTestUser()
    reporter = await createTestUser()
  })

  it('returns a fresh claim with claimed_by_other=false when no prior claim exists', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-report-fresh-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Report Fresh',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    const result = await claimModerationQueueItem(mod1.id, {
      communityId: community.id,
      reportId,
    })

    expect(result.claimed_by_other).toBe(false)
    expect(result.claim.claimed_by_id).toBe(mod1.id)
    expect(result.claim.report_id).toBe(reportId)
    expect(result.claim.released_at).toBeNull()
  })

  it('renews own claim and returns claimed_by_other=false', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-report-renew-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Report Renew',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await claimModerationQueueItem(mod1.id, { communityId: community.id, reportId })
    const result = await claimModerationQueueItem(mod1.id, { communityId: community.id, reportId })

    expect(result.claimed_by_other).toBe(false)
    expect(result.claim.claimed_by_id).toBe(mod1.id)
  })

  it('takes over an expired claim and returns claimed_by_other=false', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-report-expire-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Report Expire',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await claimModerationQueueItem(mod2.id, { communityId: community.id, reportId })
    await backdateModQueueClaim({ reportId, userId: mod2.id, minutes: 20 })

    const result = await claimModerationQueueItem(mod1.id, { communityId: community.id, reportId })

    expect(result.claimed_by_other).toBe(false)
    expect(result.claim.claimed_by_id).toBe(mod1.id)
  })

  it('returns holder claim with claimed_by_other=true when fresh claim held by another mod', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-report-blocked-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Report Blocked',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await claimModerationQueueItem(mod2.id, { communityId: community.id, reportId })
    const result = await claimModerationQueueItem(mod1.id, { communityId: community.id, reportId })

    expect(result.claimed_by_other).toBe(true)
    expect(result.claim.claimed_by_id).toBe(mod2.id)
  })
})

describe('claimModerationQueueItem - post', () => {
  let mod1: PrivateUser
  let mod2: PrivateUser
  let postAuthor: PrivateUser

  beforeAll(async () => {
    mod1 = await createTestUser()
    mod2 = await createTestUser()
    postAuthor = await createTestUser()
  })

  it('returns a fresh claim with claimed_by_other=false for a post', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-post-fresh-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Post Fresh',
      markdown: 'body',
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    const result = await claimModerationQueueItem(mod1.id, { communityId: community.id, postId })

    expect(result.claimed_by_other).toBe(false)
    expect(result.claim.claimed_by_id).toBe(mod1.id)
    expect(result.claim.post_id).toBe(postId)
  })

  it('renews own post claim and returns claimed_by_other=false', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-post-renew-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Post Renew',
      markdown: 'body',
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    await claimModerationQueueItem(mod1.id, { communityId: community.id, postId })
    const result = await claimModerationQueueItem(mod1.id, { communityId: community.id, postId })

    expect(result.claimed_by_other).toBe(false)
    expect(result.claim.claimed_by_id).toBe(mod1.id)
  })

  it('takes over an expired post claim and returns claimed_by_other=false', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-post-expire-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Post Expire',
      markdown: 'body',
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    await claimModerationQueueItem(mod2.id, { communityId: community.id, postId })
    await backdateModQueueClaim({ postId, userId: mod2.id, minutes: 20 })

    const result = await claimModerationQueueItem(mod1.id, { communityId: community.id, postId })

    expect(result.claimed_by_other).toBe(false)
    expect(result.claim.claimed_by_id).toBe(mod1.id)
  })

  it('returns holder claim with claimed_by_other=true for a fresh post claim held by another mod', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-post-blocked-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Post Blocked',
      markdown: 'body',
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    await claimModerationQueueItem(mod2.id, { communityId: community.id, postId })
    const result = await claimModerationQueueItem(mod1.id, { communityId: community.id, postId })

    expect(result.claimed_by_other).toBe(true)
    expect(result.claim.claimed_by_id).toBe(mod2.id)
  })
})

describe('claimModerationQueueItem - validation', () => {
  it('rejects when neither reportId nor postId is provided', async () => {
    await expect(
      claimModerationQueueItem('user-id', { communityId: 'community-id' }),
    ).rejects.toThrow('Exactly one of reportId or postId must be set')
  })
})

describe('releaseModerationQueueItem - validation', () => {
  it('rejects when neither reportId nor postId is provided', async () => {
    await expect(releaseModerationQueueItem('user-id', {})).rejects.toThrow(
      'Exactly one of reportId or postId must be set',
    )
  })
})

describe('releaseModerationQueueItem', () => {
  let mod1: PrivateUser
  let mod2: PrivateUser
  let postAuthor: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    mod1 = await createTestUser()
    mod2 = await createTestUser()
    postAuthor = await createTestUser()
    reporter = await createTestUser()
  })

  it('releases the caller own report claim', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-release-own-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Release Own',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await claimModerationQueueItem(mod1.id, { communityId: community.id, reportId })
    await releaseModerationQueueItem(mod1.id, { communityId: community.id, reportId })

    // Re-claiming should succeed since the claim was released
    const result = await claimModerationQueueItem(mod2.id, { communityId: community.id, reportId })
    expect(result.claimed_by_other).toBe(false)
    expect(result.claim.claimed_by_id).toBe(mod2.id)
  })

  it('does not release another mod report claim', async () => {
    const community = await createTestCommunity(mod1.id)
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `claim-release-other-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Release Other',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })

    await claimModerationQueueItem(mod1.id, { communityId: community.id, reportId })
    await releaseModerationQueueItem(mod2.id, { communityId: community.id, reportId })

    // mod1's claim should still be active
    const result = await claimModerationQueueItem(mod2.id, { communityId: community.id, reportId })
    expect(result.claimed_by_other).toBe(true)
    expect(result.claim.claimed_by_id).toBe(mod1.id)
  })
})
