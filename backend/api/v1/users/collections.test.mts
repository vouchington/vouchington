import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createUserProfileFixture, safeUsername } from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { updateUserFields } from '@services/users/update-fields'
import {
  PRIVATE_USER_PROFILE_COLLECTIONS,
  getProfileCollectionRouteSuffix,
} from '@ts-shared/user-profile-collections'
import { parseMediaType } from './collection-route-helpers.mts'

describe('GET /api/v1/users/:idOrSlug collections', () => {
  it('validates media_type query parameter', () => {
    expect(parseMediaType(undefined)).toBeUndefined()
    expect(parseMediaType(null)).toBeUndefined()
    expect(parseMediaType('article')).toBe('article')
    expect(parseMediaType('audio')).toBe('audio')
    expect(parseMediaType('video')).toBe('video')
    expect(() => parseMediaType('invalid')).toThrow('Invalid media_type')
    expect(() => parseMediaType(123)).toThrow('Invalid media_type')
  })

  it('returns public follow collections and only sets public cache headers for anonymous viewers', async () => {
    const fixture = await createUserProfileFixture()
    const anonymousRequest = createRequest()

    const followingResponse = await anonymousRequest
      .get(`/api/v1/users/${fixture.owner.username}/topics/following`)
      .expect(200)
    expect(followingResponse.body.results).toHaveLength(1)
    expect(followingResponse.body.results[0].id).toBe(fixture.followingTopic.id)
    expect(followingResponse.headers['cache-control']).toContain('public')
    expect(followingResponse.headers['cache-control']).toContain(
      `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
    )

    const followerViewer = await createTestUser({
      username: safeUsername('users-viewer'),
    })
    if (!followerViewer) throw new Error('Failed to create test viewer')
    const authenticatedRequest = createRequest()
    await authenticatedRequest.authenticateAs(followerViewer)

    const followersResponse = await authenticatedRequest
      .get(`/api/v1/users/${fixture.owner.username}/users/followers`)
      .expect(200)
    expect(followersResponse.body.results).toHaveLength(1)
    expect(followersResponse.body.results[0].id).toBe(fixture.follower.id)
    expect(followersResponse.headers['cache-control'] || '').not.toContain('public')

    const feedsResponse = await authenticatedRequest
      .get(`/api/v1/users/${fixture.owner.username}/rss-feeds/following`)
      .expect(200)
    expect(feedsResponse.body.results).toHaveLength(1)
    expect(feedsResponse.body.results[0].id).toBe(fixture.rssFeedId)
    expect(feedsResponse.headers['cache-control'] || '').not.toContain('public')
  })

  it('returns 404 when follows_visibility restricts access to users/following', async () => {
    const fixture = await createUserProfileFixture()
    await updateUserFields(fixture.owner.id, { follows_visibility: 'nobody' })

    const stranger = await createTestUser({ username: safeUsername('stranger-follows') })
    if (!stranger) throw new Error('Failed to create stranger')
    // Anonymous gets 404 for users/following (controlled by follows_visibility)
    await createRequest().get(`/api/v1/users/${fixture.owner.username}/users/following`).expect(404)

    // Logged-in non-follower gets 404
    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest.get(`/api/v1/users/${fixture.owner.username}/users/following`).expect(404)

    // Owner can still view own collections
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(fixture.owner)
    await ownerRequest.get(`/api/v1/users/${fixture.owner.username}/users/following`).expect(200)
  })

  it('returns 404 when topic_follows_visibility restricts access', async () => {
    const fixture = await createUserProfileFixture()
    await updateUserFields(fixture.owner.id, { topic_follows_visibility: 'nobody' })

    const stranger = await createTestUser({ username: safeUsername('stranger-topic-follows') })
    if (!stranger) throw new Error('Failed to create stranger')
    // Anonymous gets 404
    await createRequest()
      .get(`/api/v1/users/${fixture.owner.username}/topics/following`)
      .expect(404)

    // Logged-in non-follower gets 404
    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest
      .get(`/api/v1/users/${fixture.owner.username}/topics/following`)
      .expect(404)

    // Owner can still view own collection
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(fixture.owner)
    await ownerRequest.get(`/api/v1/users/${fixture.owner.username}/topics/following`).expect(200)
  })

  it('returns subscribed RSS feeds for authenticated owner', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-sub-owner') })
    if (!owner) throw new Error('Failed to create owner')
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)

    const emptyResponse = await ownerRequest
      .get(`/api/v1/users/${owner.username}/rss-feeds/subscribed`)
      .expect(200)
    expect(emptyResponse.body.results).toHaveLength(0)
  })

  it('returns 401 for unauthenticated subscribed collection', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-sub-unauth') })
    if (!owner) throw new Error('Failed to create owner')
    await createRequest().get(`/api/v1/users/${owner.username}/rss-feeds/subscribed`).expect(401)
  })

  it('returns 400 for invalid rss-feeds listType', async () => {
    const owner = await createTestUser({ username: safeUsername('rss-bad-type') })
    if (!owner) throw new Error('Failed to create owner')
    await createRequest().get(`/api/v1/users/${owner.username}/rss-feeds/invalid_type`).expect(400)
  })

  it('returns 404 when rss_feed_follows_visibility restricts access', async () => {
    const fixture = await createUserProfileFixture()
    await updateUserFields(fixture.owner.id, { rss_feed_follows_visibility: 'nobody' })

    const stranger = await createTestUser({ username: safeUsername('stranger-rss-follows') })
    if (!stranger) throw new Error('Failed to create stranger')
    // Anonymous gets 404
    await createRequest()
      .get(`/api/v1/users/${fixture.owner.username}/rss-feeds/following`)
      .expect(404)

    // Logged-in non-follower gets 404
    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest
      .get(`/api/v1/users/${fixture.owner.username}/rss-feeds/following`)
      .expect(404)

    // Owner can still view own collection
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(fixture.owner)
    await ownerRequest
      .get(`/api/v1/users/${fixture.owner.username}/rss-feeds/following`)
      .expect(200)
  })

  it('returns 404 when followers_visibility restricts access', async () => {
    const fixture = await createUserProfileFixture()
    await updateUserFields(fixture.owner.id, { followers_visibility: 'nobody' })

    const stranger = await createTestUser({ username: safeUsername('stranger-followers') })
    if (!stranger) throw new Error('Failed to create stranger')
    // Anonymous gets 404
    await createRequest().get(`/api/v1/users/${fixture.owner.username}/users/followers`).expect(404)

    // Logged-in non-follower gets 404
    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest.get(`/api/v1/users/${fixture.owner.username}/users/followers`).expect(404)

    // Owner can still view own followers
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(fixture.owner)
    await ownerRequest.get(`/api/v1/users/${fixture.owner.username}/users/followers`).expect(200)
  })

  it('allows follower access when follows_visibility is followers for users/following', async () => {
    const fixture = await createUserProfileFixture()
    await updateUserFields(fixture.owner.id, { follows_visibility: 'followers' })

    // Anonymous gets 404 on users/following
    await createRequest().get(`/api/v1/users/${fixture.owner.username}/users/following`).expect(404)

    // fixture.follower follows the owner, so they should get 200
    const followerRequest = createRequest()
    await followerRequest.authenticateAs(fixture.follower)
    await followerRequest.get(`/api/v1/users/${fixture.owner.username}/users/following`).expect(200)
  })

  it('allows follower access when topic_follows_visibility is followers', async () => {
    const fixture = await createUserProfileFixture()
    await updateUserFields(fixture.owner.id, { topic_follows_visibility: 'followers' })

    // Anonymous gets 404
    await createRequest()
      .get(`/api/v1/users/${fixture.owner.username}/topics/following`)
      .expect(404)

    // fixture.follower follows the owner, so they should get 200
    const followerRequest = createRequest()
    await followerRequest.authenticateAs(fixture.follower)
    await followerRequest
      .get(`/api/v1/users/${fixture.owner.username}/topics/following`)
      .expect(200)
  })

  it('protects owner-only collections and allows owners to access them', async () => {
    const fixture = await createUserProfileFixture()
    const stranger = await createTestUser({ username: safeUsername('users-stranger') })
    if (!stranger) throw new Error('Failed to create test stranger user')
    await createRequest().get(`/api/v1/users/${fixture.owner.username}/topics/blocked`).expect(401)

    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger)
    await strangerRequest.get(`/api/v1/users/${fixture.owner.username}/topics/blocked`).expect(403)

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(fixture.owner)

    const blockedTopicsResponse = await ownerRequest
      .get(`/api/v1/users/${fixture.owner.username}/topics/blocked`)
      .expect(200)
    expect(blockedTopicsResponse.body.results[0].id).toBe(fixture.blockedTopic.id)

    const mutedUsersResponse = await ownerRequest
      .get(`/api/v1/users/${fixture.owner.username}/users/muted`)
      .expect(200)
    expect(mutedUsersResponse.body.results[0].id).toBe(fixture.mutedUser.id)

    const savedItemsResponse = await ownerRequest
      .get(`/api/v1/users/${fixture.owner.username}/rss-feed-items/saved`)
      .expect(200)
    expect(savedItemsResponse.body.results[0].id).toBe(fixture.rssItemId)
    expect(savedItemsResponse.body).toHaveProperty('rss_feed_item_thumbnail_url')
    expect(savedItemsResponse.body).toHaveProperty('rss_feed_item_embeds')
  })

  it('protects the full private relation matrix routes', async () => {
    const owner = await createTestUser({ username: safeUsername('matrix-owner') })
    if (!owner) throw new Error('Failed to create owner')

    const privateRoutes = PRIVATE_USER_PROFILE_COLLECTIONS.map(getProfileCollectionRouteSuffix)

    for (const route of privateRoutes) {
      await createRequest().get(`/api/v1/users/${owner.username}/${route}`).expect(401)
    }

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)

    for (const route of privateRoutes) {
      const response = await ownerRequest
        .get(`/api/v1/users/${owner.username}/${route}`)
        .expect(200)
      expect(response.body.results).toEqual([])
    }
  })
})
