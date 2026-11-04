import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, deleteTestPost, insertTestPost } from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('post.placeholders', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
  })

  it('answers not found for a deleted comment with no valid reply below it', async () => {
    const postId = await insertTestPost({
      title: 'Post With Empty Chain',
      slug: `post-empty-chain-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Root content',
    })
    const deletedId = await insertTestPost({
      title: '',
      slug: `comment-empty-chain-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Deleted',
      postType: 'comment',
      rootId: postId,
      parentId: postId,
    })
    await deleteTestPost(deletedId)

    await createRequest().get(`/api/v1/posts/${deletedId}/descendants`).expect(404)
    await createRequest().get(`/api/v1/posts/${deletedId}`).expect(404)
  })

  it('returns a deleted comment with a valid reply as a placeholder, without text or author', async () => {
    const rootId = await insertTestPost({
      title: 'Placeholder root',
      slug: `placeholder-detail-1-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Root',
    })
    const commentId = await insertTestPost({
      title: '',
      slug: `placeholder-detail-2-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Secret comment text',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    await insertTestPost({
      title: '',
      slug: `placeholder-detail-3-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Valid reply',
      postType: 'comment',
      rootId,
      parentId: commentId,
    })
    await deleteTestPost(commentId)

    const response = await createRequest().get(`/api/v1/posts/${commentId}`).expect(200)
    expect(response.body.post).toMatchObject({
      id: commentId,
      placeholder_state: 'deleted',
      title: '',
      markdown: '',
      created_by_id: null,
      created_by: null,
    })
    expect(response.body.html).toBe('')
    expect(JSON.stringify(response.body)).not.toContain('Secret comment text')
    await createRequest().head(`/api/v1/posts/${commentId}`).expect(200)
  })
})
