import { it, expect, describe, beforeAll } from 'vitest'
import { fetchPostsWithMetadata } from './posts.mts'
import { createTestUser, insertTestPost, insertPostElectionVote } from '@voucha/test-helpers'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import type { PrivateUser } from '@services/users/types'

describe('posts', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('fetchPostsWithMetadata', () => {
    it('returns empty objects for empty ids', async () => {
      const result = await fetchPostsWithMetadata([])

      expect(result.entities).toEqual({})
      expect(result.entity_metrics).toEqual({})
      expect(result.bookmarks).toBeUndefined()
      expect(result.election_votes).toBeUndefined()
    })

    it('returns indexed entities and metrics', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        createdById: user.id,
        slug: `post-${random}`,
        title: `Post ${random}`,
        markdown: 'body',
      })
      const result = await fetchPostsWithMetadata([postId])

      expect(result.entities[postId]).toBeDefined()
      expect(result.entity_metrics[postId]).toBeDefined()
      expect(result.bookmarks).toBeUndefined()
    })

    it('includes bookmarks for posts and creators when authenticated', async () => {
      const viewer = await createTestUser()
      const author = await createTestUser()
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        createdById: author!.id,
        slug: `post-${random}`,
        title: `Post ${random}`,
        markdown: 'body',
      })
      await bookmarkEntity(viewer!, 'post', { id: postId }, 'save')
      await bookmarkEntity(viewer!, 'user', { id: author!.id }, 'follow')

      const result = await fetchPostsWithMetadata([postId], viewer)

      expect(result.bookmarks).toBeDefined()
      expect(result.bookmarks![postId].save).toBe(true)
      expect(result.bookmarks![author!.id].follow).toBe(true)
    })

    it('includes election votes keyed by post id', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        createdById: user.id,
        slug: `post-${random}`,
        title: `Post ${random}`,
        markdown: 'body',
      })
      await insertPostElectionVote(user.id, postId, 1, undefined, false, true)

      const result = await fetchPostsWithMetadata([postId], user)

      expect(result.election_votes).toBeDefined()
      expect(result.election_votes![postId]).toBeDefined()
      expect(result.election_votes![postId].choice).toBe('like')
    })
  })
})
