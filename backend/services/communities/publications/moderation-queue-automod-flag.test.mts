import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'node:crypto'
import {
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestModerationReport,
  insertTestPost,
  setPostLLMModerationContentSha256,
  setTestCommunityPostReviewAutomodFlag,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  encodeCommunityModerationQueueCursor,
  searchCommunityModerationQueue,
} from './moderation-queue.mts'
import { dismissCommunityAutomodFlag } from './automod-flag.mts'

describe('searchCommunityModerationQueue automod flags', () => {
  let author: PrivateUser

  beforeAll(async () => {
    author = await createTestUser()
  })

  async function createCommunity() {
    const suffix = crypto.randomUUID().slice(0, 8)
    return insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Flag Community ${suffix}`,
      slug: `mod-queue-flag-comm-${suffix}`,
    })
  }

  /** A published post whose current content the community classifier flagged. */
  async function createFlaggedPost(
    communityId: string,
    action: 'review_queue' | 'unpublish' = 'review_queue',
    flaggedAt?: Date,
  ) {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-flag-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Flagged Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId,
    })
    await insertTestCommunityPostReview({ communityId, postId })
    await setPostLLMModerationContentSha256(postId, crypto.randomBytes(32))
    await setTestCommunityPostReviewAutomodFlag({ postId, action, flaggedAt })
    return postId
  }

  async function flagIds(communityId: string, options = {}) {
    const result = await searchCommunityModerationQueue(communityId, { limit: 50, ...options })
    return result.entries.filter(e => e.queue_source === 'automod_flag').map(e => e.entity_id)
  }

  it('lists a review_queue flag as an automod_flag entry for the post', async () => {
    const community = await createCommunity()
    const postId = await createFlaggedPost(community.id)

    const result = await searchCommunityModerationQueue(community.id, { limit: 50 })

    const entry = result.entries.find(e => e.entity_id === postId)
    expect(entry).toMatchObject({
      id: postId,
      queue_source: 'automod_flag',
      entity_type: 'post',
      status: 'pending',
      report_count: 0,
      target_available: true,
      target_user_id: author.id,
      target_content: { kind: 'post', text: expect.stringContaining('Flagged Post') },
    })
    expect(entry!.target_path).toMatch(/^\/discussion\//)
  })

  it('never lists an unpublish flag: the action was already taken', async () => {
    const community = await createCommunity()
    await createFlaggedPost(community.id, 'unpublish')

    expect(await flagIds(community.id)).toEqual([])
  })

  it('stops listing a flag once it is dismissed', async () => {
    const community = await createCommunity()
    const postId = await createFlaggedPost(community.id)
    expect(await flagIds(community.id)).toEqual([postId])

    await dismissCommunityAutomodFlag({
      communityId: community.id,
      postId,
      dismissedById: author.id,
    })

    expect(await flagIds(community.id)).toEqual([])
  })

  it('stops listing a flag when the post content version changes', async () => {
    const community = await createCommunity()
    const postId = await createFlaggedPost(community.id)

    await setPostLLMModerationContentSha256(postId, crypto.randomBytes(32))

    expect(await flagIds(community.id)).toEqual([])
  })

  it.each([
    ['unpublished', { unpublishedAt: new Date() }],
    ['rejected', { approvedAt: null, rejectedAt: new Date() }],
  ])('does not list a flag on a post that was %s', async (_label, state) => {
    const community = await createCommunity()
    const postId = await createFlaggedPost(community.id)

    await updateTestCommunityPostReviewState({ communityId: community.id, postId, ...state })

    expect(await flagIds(community.id)).toEqual([])
  })

  it('does not list a flag on a deleted post', async () => {
    const community = await createCommunity()
    const postId = await createFlaggedPost(community.id)

    await deleteTestPost(postId)

    expect(await flagIds(community.id)).toEqual([])
  })

  it('only lists flags of the requested community', async () => {
    const [community, other] = await Promise.all([createCommunity(), createCommunity()])
    const postId = await createFlaggedPost(community.id)
    await createFlaggedPost(other.id)

    expect(await flagIds(community.id)).toEqual([postId])
  })

  it('narrows to one source and hides flags from member-tier viewers', async () => {
    const community = await createCommunity()
    const postId = await createFlaggedPost(community.id)
    const reporter = await createTestUser()
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    const flagsOnly = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      source: 'automod_flag',
    })
    const reportsOnly = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      source: 'report',
    })
    const memberView = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      includeModeratorSources: false,
    })
    const memberFlagsOnly = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      source: 'automod_flag',
      includeModeratorSources: false,
    })

    expect(flagsOnly.entries.map(e => e.queue_source)).toEqual(['automod_flag'])
    expect(reportsOnly.entries.map(e => e.queue_source)).toEqual(['report'])
    expect(memberView.entries.map(e => e.queue_source)).toEqual(['report'])
    expect(memberFlagsOnly).toEqual({ entries: [], hasNextPage: false })
  })

  it('pages flags newest first by the time they were flagged', async () => {
    const community = await createCommunity()
    const oldest = await createFlaggedPost(community.id, 'review_queue', new Date('2026-06-01'))
    const middle = await createFlaggedPost(community.id, 'review_queue', new Date('2026-06-02'))
    const newest = await createFlaggedPost(community.id, 'review_queue', new Date('2026-06-03'))

    const page1 = await searchCommunityModerationQueue(community.id, {
      limit: 2,
      source: 'automod_flag',
    })
    expect(page1.entries.map(e => e.entity_id)).toEqual([newest, middle])
    expect(page1.hasNextPage).toBe(true)

    const page2 = await searchCommunityModerationQueue(community.id, {
      limit: 2,
      source: 'automod_flag',
      after: encodeCommunityModerationQueueCursor(page1.entries[1]!),
    })
    expect(page2.entries.map(e => e.entity_id)).toEqual([oldest])
    expect(page2.hasNextPage).toBe(false)
  })
})
