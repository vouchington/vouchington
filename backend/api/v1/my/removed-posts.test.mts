import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestPost,
  insertTestCommunityPostReview,
  setTestPostRejectedAt,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { decodeCursor } from '@modules/pagination'

describe('GET /api/v1/my/removed-posts', () => {
  let moderator: PrivateUser
  let author: PrivateUser

  beforeAll(async () => {
    moderator = await createTestUser()
    author = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/removed-posts').expect(401)
  })

  it('returns empty removed_posts for a user with no removed posts', async () => {
    const newUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(newUser)

    const response = await request.get('/api/v1/my/removed-posts').expect(200)
    expect(Array.isArray(response.body.removed_posts)).toBe(true)
    expect(response.body.removed_posts.length).toBe(0)
    expect(response.body.page_info).toHaveProperty('has_next_page', false)
  })

  it('returns community-removed posts for the authenticated user', async () => {
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })
    const postId = await insertTestPost({
      title: `API Removed Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `api-removed-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: author.id,
      markdown: 'Some content',
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })

    const request = createRequest()
    await request.authenticateAs(author)

    const response = await request.get('/api/v1/my/removed-posts').expect(200)
    const posts = response.body.removed_posts
    expect(Array.isArray(posts)).toBe(true)
    const found = posts.find((p: { post_id: string }) => p.post_id === postId)
    expect(found).toBeDefined()
    expect(found.__entity_type).toBe('removed_post')
    expect(found.community_id).toBe(community.id)
    expect(found.community_slug).toBe(community.slug)
    expect(found.post_removal_kind).toBe('community')
  })

  it('returns platform removals only through the expanded contract opt-in', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `API Platform Removed ${crypto.randomUUID()}`,
      slug: `api-platform-removed-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'Platform removed content',
      clearanceStatus: 'rejected',
    })
    const request = createRequest()
    await request.authenticateAs(user)

    const legacy = await request.get('/api/v1/my/removed-posts').expect(200)
    const expanded = await request.get('/api/v1/my/removed-posts?include_platform=true').expect(200)

    expect(legacy.body.removed_posts).not.toContainEqual(
      expect.objectContaining({ post_id: postId }),
    )
    expect(expanded.body.removed_posts).toContainEqual({
      post_id: postId,
      post_title: expect.any(String),
      post_declared_language: null,
      post_lingua_rs_detected_language: null,
      community_id: null,
      community_slug: null,
      unpublished_at: expect.any(String),
      post_removal_kind: 'platform',
      __entity_type: 'removed_post',
    })
  })

  it('does not return removed posts belonging to other users', async () => {
    const other = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })
    const postId = await insertTestPost({
      title: `Other User Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `other-user-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: other.id,
      markdown: 'Other content',
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: other.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })

    const freshUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(freshUser)

    const response = await request.get('/api/v1/my/removed-posts').expect(200)
    const found = response.body.removed_posts.find((p: { post_id: string }) => p.post_id === postId)
    expect(found).toBeUndefined()
  })

  it("does not return another user's platform-removed posts through the expanded contract", async () => {
    const other = await createTestUser()
    const postId = await insertTestPost({
      title: `Other Platform Removed ${crypto.randomUUID()}`,
      slug: `other-platform-removed-${crypto.randomUUID()}`,
      createdById: other.id,
      markdown: 'Other platform-removed content',
      clearanceStatus: 'rejected',
    })
    const request = createRequest()
    await request.authenticateAs(author)

    const response = await request.get('/api/v1/my/removed-posts?include_platform=true').expect(200)

    expect(response.body.removed_posts).not.toContainEqual(
      expect.objectContaining({ post_id: postId }),
    )
  })

  it('does not return soft-deleted platform-removed posts through the expanded contract', async () => {
    const postId = await insertTestPost({
      title: `Deleted Platform Removed ${crypto.randomUUID()}`,
      slug: `deleted-platform-removed-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Deleted platform-removed content',
      clearanceStatus: 'rejected',
    })
    await deleteTestPost(postId)
    const request = createRequest()
    await request.authenticateAs(author)

    const response = await request.get('/api/v1/my/removed-posts?include_platform=true').expect(200)

    expect(response.body.removed_posts).not.toContainEqual(
      expect.objectContaining({ post_id: postId }),
    )
  })

  it('accepts a valid limit query param', async () => {
    const request = createRequest()
    await request.authenticateAs(author)

    const response = await request.get('/api/v1/my/removed-posts?limit=10').expect(200)
    expect(Array.isArray(response.body.removed_posts)).toBe(true)
  })

  it('accepts an after query param for pagination', async () => {
    const request = createRequest()
    await request.authenticateAs(author)

    const first = await request.get('/api/v1/my/removed-posts?limit=1').expect(200)
    if (first.body.page_info.end_cursor) {
      const after = encodeURIComponent(first.body.page_info.end_cursor)
      await request.get(`/api/v1/my/removed-posts?after=${after}`).expect(200)
    }
  })

  it('continues a legacy cursor safely after the expanded backend contract deploys', async () => {
    const rolloutUser = await createTestUser()
    const community = await insertTestCommunity({
      createdById: moderator.id,
      visibility: 'public',
    })
    const communityPostIds = await Promise.all(
      [0, 1, 2].map(async index => {
        const postId = await insertTestPost({
          title: `Rollout community removal ${index} ${crypto.randomUUID()}`,
          slug: `rollout-community-removal-${index}-${crypto.randomUUID()}`,
          createdById: rolloutUser.id,
          markdown: 'Community removed content',
          clearanceStatus: 'approved',
        })
        await insertTestCommunityPostReview({
          communityId: community.id,
          postId,
          submittedById: rolloutUser.id,
        })
        await updateTestCommunityPostReviewState({
          communityId: community.id,
          postId,
          unpublishedAt: new Date(`2026-07-30T12:00:0${index + 1}.000Z`),
        })
        return postId
      }),
    )
    const platformPostId = await insertTestPost({
      title: `Rollout platform removal ${crypto.randomUUID()}`,
      slug: `rollout-platform-removal-${crypto.randomUUID()}`,
      createdById: rolloutUser.id,
      markdown: 'Platform removed content',
      clearanceStatus: 'rejected',
    })
    await setTestPostRejectedAt(platformPostId, new Date('2026-07-30T11:00:00.000Z'))

    const request = createRequest()
    await request.authenticateAs(rolloutUser)
    const legacyFirstPage = await request.get('/api/v1/my/removed-posts?limit=1').expect(200)
    const after = encodeURIComponent(legacyFirstPage.body.page_info.end_cursor)
    const continued = await request
      .get(`/api/v1/my/removed-posts?include_platform=true&limit=1&after=${after}`)
      .expect(200)

    expect(continued.body.removed_posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          post_id: communityPostIds[1],
          post_removal_kind: 'community',
        }),
      ]),
    )
    expect(continued.body.removed_posts).not.toContainEqual(
      expect.objectContaining({ post_id: platformPostId }),
    )
    expect(decodeCursor(continued.body.page_info.end_cursor)).toEqual(
      expect.objectContaining({
        scope: `user-removed-community-posts:${rolloutUser.id}:unpublished-desc-post-id-desc`,
      }),
    )
  })
})
