import { readTestPostCreator } from '../../../test-helpers/publication-test-queries.mts'
import { DELETED_USER_ID } from '@services/users/constants'
import { deleteUser } from '@services/users/delete'
import {
  createTestPost,
  createTestRetentionWindow,
  createTestUser,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { drainUserDeletionForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { describe, expect, it } from 'vitest'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('deleted author publication cleanup', () => {
  it('drains an authored post before purging a user whose username was scrubbed', async () => {
    const user = await createTestUser()
    if (!user.username) throw new Error('Expected username')
    const post = await createTestPost({ user })
    await drainUserDeletionForTest(await deleteUser(user, user))
    const afterScrub = await getTestUserRaw(user.id)
    expect(afterScrub?.username).not.toBe(user.username)

    const window = createTestRetentionWindow()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await expect(cleanupSoftDeletedUser(user.id, window.upperBoundDate)).resolves.toEqual({
      deleted: 1,
      hasMore: false,
    })
    expect(await getTestUserRaw(user.id)).toBeNull()
    expect(await readTestPostCreator(post.id)).toBe(DELETED_USER_ID)
  })
})
