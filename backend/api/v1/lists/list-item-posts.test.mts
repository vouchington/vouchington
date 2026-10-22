import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  archiveTestCommunity,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { registerUserListItemRouteTests } from '@voucha/test-helpers/user-list-item-routes'
import type { PrivateUser } from '@voucha/types/entities/user'
import { archivePost } from '@services/posts/archive'
import { searchListItems } from '@services/lists'

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
    listId: created.body.list.id as string,
    sent: request
      .post(`/api/v1/lists/${created.body.list.id}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId }),
  }
}

describe('POST /api/v1/lists/:id/items/posts visibility', () => {
  it('returns 422 for a post in an archived community and creates no row', async () => {
    const caller = await createTestUser()
    const community = await insertTestCommunity({ createdById: caller.id })
    const postId = await insertTestPost({
      title: `Archived community ${createRandomString(8)}`,
      slug: `archived-community-${createRandomString(8)}`,
      createdById: caller.id,
      communityId: community.id,
      markdown: 'archived community',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: caller.id,
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: caller.id })
    const { sent, listId } = await addPost(caller, postId)
    const response = await sent.expect(422)
    expect(response.body.message).toBe("Post can't be added to a list")
    expect((await searchListItems(listId, { currentUserId: caller.id })).results).toEqual([])
  })

  it('returns 422 for an archived post the caller can still name', async () => {
    const caller = await createTestUser()
    const postId = await insertTestPost({
      title: `Archived ${createRandomString(8)}`,
      slug: `archived-${createRandomString(8)}`,
      createdById: caller.id,
      markdown: 'archived',
    })
    await archivePost(postId, caller.id)
    const { sent } = await addPost(caller, postId)
    const response = await sent.expect(422)
    expect(response.body.message).toBe("Post can't be added to a list")
  })

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
