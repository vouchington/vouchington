import {
  beginTransaction,
  createTestPost,
  createTestUser,
  insertBulkPostsForUserForTest,
} from '@voucha/test-helpers'
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
    await insertBulkPostsForUserForTest(user.id, USER_CASCADE_CAPTURE_MAX_POSTS + 1)

    await using transaction = await beginTransaction()
    await expect(retainUserCascadeHardDeletedPosts(transaction, user.id)).rejects.toThrow(
      `more than ${USER_CASCADE_CAPTURE_MAX_POSTS} posts`,
    )
  })
})
