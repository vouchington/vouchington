import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
  insertTestPost,
  getCommunityPostReviewStatus,
  updateTestCommunityPostReviewState,
  type TestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import {
  getCommunityAgentPromptFalsePositiveEstimate,
  normalizeSimulationLimit,
  normalizeSimulationTimeWindow,
  searchCommunityAgentPromptSimulationPosts,
} from './simulations.mts'

describe('community agent prompt simulations', () => {
  let owner: PrivateUser
  let community: Community
  let prompt: TestCommunityAgentPrompt

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: false,
    })
  })

  it('normalizes supported options and rejects unsupported values', () => {
    expect(normalizeSimulationTimeWindow(undefined)).toBe(168)
    expect(normalizeSimulationTimeWindow(24)).toBe(24)
    expect(() => normalizeSimulationTimeWindow(7)).toThrow('time_window_hours')
    expect(normalizeSimulationLimit(undefined)).toBe(25)
    expect(normalizeSimulationLimit(50)).toBe(50)
    expect(() => normalizeSimulationLimit(0)).toThrow('limit')
  })

  it('samples only recent approved visible community posts', async () => {
    const suffix = createRandomString(8)
    const recentPostId = await insertCommunityPost(`recent-${suffix}`)
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: recentPostId,
      submittedById: owner.id,
    })

    const pendingPostId = await insertCommunityPost(`pending-${suffix}`)
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: pendingPostId,
      submittedById: owner.id,
    })

    const oldPostId = await insertCommunityPost(`old-${suffix}`)
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: oldPostId,
      submittedById: owner.id,
      approvedAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
    })

    const unpublishedPostId = await insertCommunityPost(`unpublished-${suffix}`)
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: unpublishedPostId,
      submittedById: owner.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId: unpublishedPostId,
      approvedAt: new Date(),
      unpublishedAt: new Date(),
    })

    const rejectedPostId = await insertCommunityPost(`rejected-${suffix}`)
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: rejectedPostId,
      submittedById: owner.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId: rejectedPostId,
      approvedAt: null,
      rejectedAt: new Date(),
    })

    const globallyPendingPostId = await insertCommunityPost(`global-pending-${suffix}`, {
      clearanceStatus: 'pending',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: globallyPendingPostId,
      submittedById: owner.id,
    })

    const posts = await searchCommunityAgentPromptSimulationPosts(community.id, {
      timeWindowHours: 24,
      limit: 10,
    })
    const postIds = posts.map(post => post.id)

    expect(postIds).toContain(recentPostId)
    expect(postIds).not.toContain(pendingPostId)
    expect(postIds).not.toContain(oldPostId)
    expect(postIds).not.toContain(unpublishedPostId)
    expect(postIds).not.toContain(rejectedPostId)
    expect(postIds).not.toContain(globallyPendingPostId)
    expect(posts.find(post => post.id === recentPostId)?.content_excerpt).toContain('recent')

    const longPostId = await insertCommunityPost(`long-${suffix}`, {
      markdown: 'x'.repeat(300),
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: longPostId,
      submittedById: owner.id,
    })
    const longPost = (
      await searchCommunityAgentPromptSimulationPosts(community.id, {
        timeWindowHours: 24,
        limit: 20,
      })
    ).find(post => post.id === longPostId)!
    expect(longPost.content_excerpt).toHaveLength(240)
    expect(longPost.content_excerpt.endsWith('...')).toBe(true)
  })

  it('preserves omitted community post review timestamps when updating test state', async () => {
    const suffix = createRandomString(8)
    const postId = await insertCommunityPost(`partial-update-${suffix}`)
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })

    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })

    const status = await getCommunityPostReviewStatus(community.id, postId)
    expect(status?.approved_at).toBeInstanceOf(Date)
    expect(status?.unpublished_at).toBeInstanceOf(Date)
  })

  it('estimates false positives from flagged history that remains approved', async () => {
    const suffix = createRandomString(8)
    const approvedFlaggedPostId = await insertCommunityPost(`approved-flagged-${suffix}`)
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: approvedFlaggedPostId,
      submittedById: owner.id,
    })
    await insertTestAgentModeration({
      postId: approvedFlaggedPostId,
      promptId: prompt.id,
      agentId: prompt.agent_id,
      flagged: true,
      results: { flagged: true, reason: 'Approved after flag' },
    })

    const pendingFlaggedPostId = await insertCommunityPost(`pending-flagged-${suffix}`)
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: pendingFlaggedPostId,
      submittedById: owner.id,
    })
    await insertTestAgentModeration({
      postId: pendingFlaggedPostId,
      promptId: prompt.id,
      agentId: prompt.agent_id,
      flagged: true,
      results: { flagged: true, reason: 'Still pending' },
    })

    const globallyPendingFlaggedPostId = await insertCommunityPost(
      `globally-pending-flagged-${suffix}`,
      { clearanceStatus: 'pending' },
    )
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: globallyPendingFlaggedPostId,
      submittedById: owner.id,
    })
    await insertTestAgentModeration({
      postId: globallyPendingFlaggedPostId,
      promptId: prompt.id,
      agentId: prompt.agent_id,
      flagged: true,
      results: { flagged: true, reason: 'Community approved but globally pending' },
    })

    const estimate = await getCommunityAgentPromptFalsePositiveEstimate(community.id, prompt.id)
    expect(estimate.historical_flagged_count).toBe(3)
    expect(estimate.historical_approved_count).toBe(1)
    expect(estimate.rate).toBe(1 / 3)
  })

  async function insertCommunityPost(
    slugPart: string,
    options: {
      clearanceStatus?: 'pending' | 'approved' | 'rejected' | 'in_review'
      markdown?: string
    } = {},
  ): Promise<string> {
    return await insertTestPost({
      title: `Simulation ${slugPart}`,
      slug: `simulation-${slugPart}`,
      markdown: options.markdown ?? `Simulation body ${slugPart}`,
      createdById: owner.id,
      communityId: community.id,
      clearanceStatus: options.clearanceStatus,
    })
  }
})
