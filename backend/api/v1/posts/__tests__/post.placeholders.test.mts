import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  followUser,
  insertTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('post.placeholders', () => {
  let creator: PrivateUser
  let follower: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    follower = await createTestUser()
    await followUser(follower, creator)
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
  it('refuses a viewer who cannot read the root, even for a placeholder head with a valid reply', async () => {
    const rootId = await insertTestPost({
      title: 'Private placeholder root',
      slug: `placeholder-private-1-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Root',
      broadcast: 'followers',
      privacy: 'private',
    })
    const headId = await insertTestPost({
      title: '',
      slug: `placeholder-private-2-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Secret head text',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    const replyId = await insertTestPost({
      title: '',
      slug: `placeholder-private-3-${Date.now()}`,
      createdById: creator.id,
      markdown: 'Secret reply text',
      postType: 'comment',
      rootId,
      parentId: headId,
    })
    await deleteTestPost(headId)

    const loggedOut = createRequest()
    for (const path of [
      `/api/v1/posts/${headId}/ancestors`,
      `/api/v1/posts/${replyId}/ancestors`,
      `/api/v1/posts/${headId}/descendants`,
      `/api/v1/posts/${headId}`,
    ]) {
      await loggedOut.get(path).expect(404)
    }

    const followerRequest = createRequest()
    await followerRequest.authenticateAs(follower)
    const response = await followerRequest.get(`/api/v1/posts/${headId}/ancestors`).expect(200)
    expect(response.body.posts[headId]).toMatchObject({
      placeholder_state: 'deleted',
      markdown: '',
      created_by_id: null,
    })
    expect(JSON.stringify(response.body)).not.toContain('Secret head text')
  })
  it('serves a valid target under a deleted and an unmoderated ancestor without their text or author', async () => {
    const root = await createTestPost({ user: creator })
    const comment = (parent: { id: string }, markdown: string) =>
      createTestPost({
        user: creator,
        post_type: 'comment',
        parent_post_id: parent.id,
        root_post_id: root.id,
        markdown,
      })
    const deleted = await comment(root, 'Deleted ancestor text')
    const unmoderated = await comment(deleted, 'Unmoderated ancestor text')
    const target = await comment(unmoderated, 'Readable target text')
    await setTestPostClearanceStatus(unmoderated.id, 'pending', follower.id)
    await deleteTestPost(deleted.id)

    const response = await createRequest().get(`/api/v1/posts/${target.id}/ancestors`).expect(200)

    expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
      root.id,
      deleted.id,
      unmoderated.id,
      target.id,
    ])
    expect(response.body.posts[deleted.id]).toMatchObject({
      placeholder_state: 'deleted',
      markdown: '',
      created_by_id: null,
    })
    expect(response.body.posts[unmoderated.id]).toMatchObject({
      placeholder_state: 'unmoderated',
      markdown: '',
      created_by_id: null,
    })
    expect(response.body.markdown_to_html[deleted.id]).toBeUndefined()
    expect(response.body.markdown_to_html[unmoderated.id]).toBeUndefined()
    expect(response.body.markdown_to_html[target.id]).toBeDefined()
    expect(JSON.stringify(response.body)).not.toContain('ancestor text')
  })
})
