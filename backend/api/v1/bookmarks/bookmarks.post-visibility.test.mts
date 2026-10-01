import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, deleteTestPost, insertTestPost } from '@voucha/test-helpers'

describe('bookmark post root visibility', () => {
  it('hides a reply when its root post has been deleted', async () => {
    const viewer = await createTestUser()
    const rootId = await insertTestPost({
      title: `Deleted bookmark root ${crypto.randomUUID()}`,
      slug: `deleted-bookmark-root-${crypto.randomUUID()}`,
      createdById: viewer.id,
      markdown: 'deleted root',
    })
    const replyId = await insertTestPost({
      title: `Reply under deleted bookmark root ${crypto.randomUUID()}`,
      slug: `reply-under-deleted-root-${crypto.randomUUID()}`,
      createdById: viewer.id,
      markdown: 'reply',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    await deleteTestPost(rootId)

    const request = createRequest()
    await request.authenticateAs(viewer)
    await request.get(`/api/v1/posts/${replyId}`).expect(404)
    const response = await request.put(`/api/v1/bookmarks/post/${replyId}/save`)
    expect(response.status).toBe(404)
    expect(response.body.message).toBe('Entity not found')
  })
})
