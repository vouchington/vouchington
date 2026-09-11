import { describe, expect, it } from 'vitest'

import { createTestPost } from '@voucha/test-helpers'

describe('createTestPost helper', () => {
  it('creates a default post user when user is null', async () => {
    const post = await createTestPost({ user: null })

    expect(post?.id).toEqual(expect.any(String))
  })
})
