import { beginTransaction, createTestPost, createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  retainUserCascadeHardDeletedPosts,
  USER_CASCADE_CAPTURE_MAX_POSTS,
} from './capture-hard-delete.mts'

describe('retainUserCascadeHardDeletedPosts', () => {
  it('captures a user with surviving posts within the cap', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    await createTestPost({ user })

    await using transaction = await beginTransaction()
    await expect(retainUserCascadeHardDeletedPosts(transaction, user.id)).resolves.toBeUndefined()
  })

  it('fails instead of capturing more than the cap of posts that survived the author drain', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    const total = USER_CASCADE_CAPTURE_MAX_POSTS + 1
    for (let start = 0; start < total; start += 50) {
      await Promise.all(
        Array.from({ length: Math.min(50, total - start) }, () => createTestPost({ user })),
      )
    }

    await using transaction = await beginTransaction()
    await expect(retainUserCascadeHardDeletedPosts(transaction, user.id)).rejects.toThrow(
      `more than ${USER_CASCADE_CAPTURE_MAX_POSTS} posts`,
    )
  })
})
