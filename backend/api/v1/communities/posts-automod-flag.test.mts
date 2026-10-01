import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getCommunityPostReviewAutomodState,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  setPostLLMModerationContentSha256,
  setTestCommunityPostReviewAutomodFlag,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal', () => {
  let author: PrivateUser
  let siteAdmin: PrivateUser
  let regularUser: PrivateUser
  const suspendedUserIds: string[] = []

  beforeAll(async () => {
    ;[author, regularUser, siteAdmin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  async function createFlaggedPost() {
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Automod Flag Route Community ${suffix}`,
      slug: `automod-flag-route-${suffix}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `automod-flag-route-post-${suffix}`,
      title: `Automod Flag Route Post ${suffix}`,
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })
    await setPostLLMModerationContentSha256(postId, crypto.randomBytes(32))
    await setTestCommunityPostReviewAutomodFlag({ postId, action: 'review_queue' })
    return { community, postId, path: `/api/v1/communities/${community.slug}/posts/${postId}` }
  }

  async function createCommunityRoleUser(communityId: string, role: 'moderator' | 'member') {
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id, role })
    return user
  }

  it('returns 401 for unauthenticated requests', async () => {
    const { path } = await createFlaggedPost()

    await createRequest().post(`${path}/automod-flag/dismissal`).expect(401)
  })

  it('lets a community moderator dismiss the flag and records them', async () => {
    const { community, postId, path } = await createFlaggedPost()
    const moderator = await createCommunityRoleUser(community.id, 'moderator')
    const request = createRequest()
    await request.authenticateAs(moderator)

    await request.post(`${path}/automod-flag/dismissal`).expect(204)

    expect(await getCommunityPostReviewAutomodState(postId)).toMatchObject({
      automod_dismissed_by_id: moderator.id,
    })
  })

  it('lets site staff dismiss a flag without community membership, by id or slug', async () => {
    const first = await createFlaggedPost()
    const second = await createFlaggedPost()
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request.post(`${first.path}/automod-flag/dismissal`).expect(204)
    await request
      .post(
        `/api/v1/communities/${second.community.id}/posts/${second.postId}/automod-flag/dismissal`,
      )
      .expect(204)

    expect(await getCommunityPostReviewAutomodState(first.postId)).toMatchObject({
      automod_dismissed_by_id: siteAdmin.id,
    })
    expect(await getCommunityPostReviewAutomodState(second.postId)).toMatchObject({
      automod_dismissed_by_id: siteAdmin.id,
    })
  })

  it.each([
    ['a signed-in non-member', null],
    ['a plain community member', 'member' as const],
  ])('returns 403 for %s and leaves the flag open', async (_label, role) => {
    const { community, postId, path } = await createFlaggedPost()
    const user = role ? await createCommunityRoleUser(community.id, role) : regularUser
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post(`${path}/automod-flag/dismissal`).expect(403)

    expect(await getCommunityPostReviewAutomodState(postId)).toMatchObject({
      automod_dismissed_at: null,
    })
  })

  it('rejects a suspended moderator', async () => {
    const { community, postId, path } = await createFlaggedPost()
    const moderator = await createCommunityRoleUser(community.id, 'moderator')
    await suspendTestUser(moderator.id)
    suspendedUserIds.push(moderator.id)
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request.post(`${path}/automod-flag/dismissal`).expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    expect(await getCommunityPostReviewAutomodState(postId)).toMatchObject({
      automod_dismissed_at: null,
    })
  })

  it('returns 204 again for a flag that is already dismissed', async () => {
    const { path } = await createFlaggedPost()
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request.post(`${path}/automod-flag/dismissal`).expect(204)
    await request.post(`${path}/automod-flag/dismissal`).expect(204)
  })

  it('returns 404 when the post has no current flag in the community', async () => {
    const { community } = await createFlaggedPost()
    const other = await createFlaggedPost()
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request
      .post(
        `/api/v1/communities/${community.slug}/posts/${crypto.randomUUID()}/automod-flag/dismissal`,
      )
      .expect(404)
    await request
      .post(`/api/v1/communities/${community.slug}/posts/${other.postId}/automod-flag/dismissal`)
      .expect(404)
  })

  it('returns 422 for a malformed post id', async () => {
    const { community } = await createFlaggedPost()
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request
      .post(`/api/v1/communities/${community.slug}/posts/not-a-uuid/automod-flag/dismissal`)
      .expect(422)
  })
})
