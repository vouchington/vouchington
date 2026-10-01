import { describe, expect, it } from 'vitest'
import { createTestPost } from '@voucha/test-helpers/services/posts/test-support'

describe('createTestPost fixture', () => {
  it('creates a discussion post with a default user', async () => {
    const post = await createTestPost()
    expect(post?.id).toBeTruthy()
    expect(post?.post_type).toBe('discussion')
  })
})
