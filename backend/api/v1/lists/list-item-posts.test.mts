import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { registerUserListItemRouteTests } from '@voucha/test-helpers/user-list-item-routes'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('POST /api/v1/lists/:id/items/posts', () => {
  const routes = registerUserListItemRouteTests({
    mode: 'add',
    segment: 'posts',
    bodyKey: 'post_id',
    listNamePrefix: 'Post List',
    createEntityId: userId =>
      insertTestPost({
        title: `Post API Test ${createRandomString(8)}`,
        slug: `post-api-test-${createRandomString(8)}`,
        createdById: userId,
        markdown: 'content',
      }),
  })

  it('adds a post to the list', async () => {
    const { sent } = await routes.authorizedPost()
    const response = await sent.expect(201)
    expect(response.body.list_item.entity_id).toBe(routes.entityId())
    expect(response.body.list_item.item_type).toBe('post')
  })
})

async function addPost(user: PrivateUser, postId: string) {
  const request = createRequest()
  await request.authenticateAs(user)
  const created = await request
    .post('/api/v1/lists')
    .set('Content-Type', 'application/json')
    .send({ name: `Vis ${createRandomString(8)}` })
  return {
    sent: request
      .post(`/api/v1/lists/${created.body.list.id}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId }),
  }
}

describe('POST /api/v1/lists/:id/items/posts visibility', () => {
  it('returns 404 for a private post the caller does not own', async () => {
    const caller = await createTestUser()
    const owner = await createTestUser()
    const postId = await insertTestPost({
      title: `Hidden ${createRandomString(8)}`,
      slug: `hidden-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'hidden',
      privacy: 'private',
      broadcast: 'followers',
    })
    const { sent } = await addPost(caller, postId)
    await sent.expect(404)
  })

  it('returns 404 for a moderation-removed post', async () => {
    const caller = await createTestUser()
    const owner = await createTestUser()
    const postId = await insertTestPost({
      title: `Removed ${createRandomString(8)}`,
      slug: `removed-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'removed',
      clearanceStatus: 'rejected',
    })
    const { sent } = await addPost(caller, postId)
    await sent.expect(404)
  })

  it('returns 404 for a post in a private community the caller is not in', async () => {
    const caller = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    const postId = await insertTestPost({
      title: `Community ${createRandomString(8)}`,
      slug: `community-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'community',
      communityId: community.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })
    const { sent } = await addPost(caller, postId)
    await sent.expect(404)
  })

  it('returns 201 for the caller’s own private post', async () => {
    const caller = await createTestUser()
    const postId = await insertTestPost({
      title: `Mine ${createRandomString(8)}`,
      slug: `mine-${createRandomString(8)}`,
      createdById: caller.id,
      markdown: 'mine',
      privacy: 'private',
      broadcast: 'users',
    })
    const { sent } = await addPost(caller, postId)
    const response = await sent.expect(201)
    expect(response.body.list_item.entity_id).toBe(postId)
  })
})

describe('DELETE /api/v1/lists/:id/items/posts/:entityId', () => {
  registerUserListItemRouteTests({
    mode: 'remove',
    segment: 'posts',
    bodyKey: 'post_id',
    listNamePrefix: 'Post Del List',
    createEntityId: userId =>
      insertTestPost({
        title: `Post Del Test ${createRandomString(8)}`,
        slug: `post-del-test-${createRandomString(8)}`,
        createdById: userId,
        markdown: 'content',
      }),
  })
})
