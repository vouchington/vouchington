import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createRandomString,
  insertTestTopic,
  insertTestRssFeed,
  insertTestPost,
  insertTestCommunity,
  insertTestCommunityListItem,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/lists/:id/import', () => {
  let user: PrivateUser
  let communityId: string
  let communitySlug: string
  let listId: string
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    communityId = community.id
    communitySlug = community.slug

    const topicId = await insertTestTopic({
      name: `Import API Topic ${createRandomString(8)}`,
      slug: `import-api-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const rssFeedId = await insertTestRssFeed({
      topicId,
      title: `Import API Feed ${createRandomString(8)}`,
    })
    postId = await insertTestPost({
      title: `Import API Post ${createRandomString(8)}`,
      slug: `import-api-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })

    await insertTestCommunityListItem({
      communityId,
      itemType: 'post',
      entityId: postId,
      addedById: user.id,
    })
    await insertTestCommunityListItem({
      communityId,
      itemType: 'rss_feed',
      entityId: rssFeedId,
      addedById: user.id,
    })

    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Import API List ${createRandomString(8)}` })
    listId = r.body.list.id
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/lists/${listId}/import`)
      .set('Content-Type', 'application/json')
      .send({ community_slug: communitySlug })
      .expect(401)
  })

  it('imports community posts and feed items', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post(`/api/v1/lists/${listId}/import`)
      .set('Content-Type', 'application/json')
      .send({ community_slug: communitySlug })
      .expect(200)
    expect(response.body.posts).toBeGreaterThanOrEqual(1)
  })

  it('returns 403 for non-owner', async () => {
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .post(`/api/v1/lists/${listId}/import`)
      .set('Content-Type', 'application/json')
      .send({ community_slug: communitySlug })
      .expect(403)
  })

  it('returns 422 when community_slug is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/import`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })

  it('returns 404 when community is not found', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/import`)
      .set('Content-Type', 'application/json')
      .send({ community_slug: 'nonexistent-community-xyz-abc' })
      .expect(404)
  })

  it('returns 422 for invalid list UUID param', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/lists/not-a-uuid/import')
      .set('Content-Type', 'application/json')
      .send({ community_slug: communitySlug })
      .expect(422)
  })
})
