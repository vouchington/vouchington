import { it, expect, beforeAll, describe } from 'vitest'
import { getPostByAny } from './get.mts'
import { createPost } from './create.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('get.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('getPostByAny returns null when post does not exist', async () => {
    const post = await getPostByAny('00000000-0000-0000-0000-000000000000')
    expect(post).toBeNull()
  })

  it('getPostByAny returns post by UUID', async () => {
    const post = await createPost(user, {
      title: 'Test Post',
      markdown: 'Test content',
      post_type: 'discussion',
    })
    const retrieved = await getPostByAny(post.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(post.id)
    expect(retrieved!.title).toBe('Test Post')
  })

  it('getPostByAny returns post by slug', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `slug-test-post-${random}`
    const post = await createPost(user, {
      title: 'Slug Test Post',
      markdown: 'Test content',
      slug,
    })
    const retrieved = await getPostByAny(slug)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(post.id)
  })

  it('getPostByAny throws error for invalid post id or slug', async () => {
    // 'not-a-uuid-or-slug' is actually a valid slug format, so use something that's neither UUID nor slug
    const err = await getPostByAny('not a valid slug!').catch(e => e)
    expect(err).toBeDefined()
    expect(err.message).toBe('Invalid post id or slug')
    expect(err.statusCode).toBe(422)
  })

  it('getPostByAny filters by post_type', async () => {
    const discussionPost = await createPost(user, {
      title: 'Discussion Post',
      post_type: 'discussion',
    })
    const retrieved = await getPostByAny(discussionPost.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(discussionPost.id)
  })
})
