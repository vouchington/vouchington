import { describe, expect, it } from 'vitest'
import { createRandomString, insertTestPost } from '@voucha/test-helpers'
import { registerUserListItemRouteTests } from '@voucha/test-helpers/user-list-item-routes'

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
