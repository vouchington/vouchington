import { beforeAll, describe, it } from 'vitest'

import { archivePost } from '@services/posts/archive'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/api/test-helpers/server'
// Register this package routes on the shared app singleton for route tests.
import '../index.mts'
import {
  createTestUser,
  deleteTestPost,
  insertTestPost,
  setMarkdownPostVotesForTest,
  setPostVotesCountForTest,
} from '@voucha/test-helpers'

describe('posts markdown visibility', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('GET /md/posts/:idOrSlug', () => {
    it('returns 404 for posts below the markdown vote threshold', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Low Vote MD Post ${random}`,
        slug: `low-vote-md-post-${random}`,
        createdById: user.id,
        markdown: 'Low vote content.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setPostVotesCountForTest({ postId, up: 1, down: 1 })
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })

    it('returns 404 for deleted posts', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Deleted MD Post ${random}`,
        slug: `deleted-md-post-${random}`,
        createdById: user.id,
        markdown: 'Deleted content.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      await deleteTestPost(postId)
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })

    it('returns 404 for archived posts', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Archived MD Post ${random}`,
        slug: `archived-md-post-${random}`,
        createdById: user.id,
        markdown: 'Archived content.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      await archivePost(postId, user.id)
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })

    it('returns 404 for comment posts', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const rootId = await insertTestPost({
        title: `Comment Root MD Post ${random}`,
        slug: `comment-root-md-post-${random}`,
        createdById: user.id,
        markdown: 'Root content.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      const commentId = await insertTestPost({
        title: `Comment MD Post ${random}`,
        slug: `comment-md-post-${random}`,
        createdById: user.id,
        markdown: 'Comment content.',
        postType: 'comment',
        rootId,
        parentId: rootId,
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId: commentId, countUp: 1 })
      const request = createRequest()
      await request.get(`/md/posts/${commentId}`).expect(404)
    })

    it('returns 404 for topic recommendation posts', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Topic Recommendation MD Post ${random}`,
        slug: `topic-recommendation-md-post-${random}`,
        createdById: user.id,
        markdown: 'Recommendation content.',
        postType: 'topic_recommendation',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })
  })
})
