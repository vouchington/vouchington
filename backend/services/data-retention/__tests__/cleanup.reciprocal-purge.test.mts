import { describe, expect, it } from 'vitest'
import { createTestUserDirect, getTestUserRaw } from '@voucha/test-helpers'
import {
  holdTestFinalPurgeUserLifecycle,
  setReciprocalTestUserDeletionActors,
} from '../../../test-helpers/reciprocal-user-purge.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('reciprocal final user purges', () => {
  it('serializes overlapping purges before either acquires user locks', async () => {
    const [firstUser, secondUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    if (!firstUser || !secondUser) throw new Error('Failed to create test users')
    await setReciprocalTestUserDeletionActors(
      firstUser.id,
      secondUser.id,
      new Date('2020-01-01T00:00:00.000Z'),
    )
    const cutoffDate = new Date('2020-02-01T00:00:00.000Z')
    const purges: Array<ReturnType<typeof cleanupSoftDeletedUser>> = []
    try {
      await using barrier = await holdTestFinalPurgeUserLifecycle(firstUser.id)
      const firstPurge = cleanupSoftDeletedUser(firstUser.id, cutoffDate)
      purges.push(firstPurge)
      const firstPurgeProcessId = await barrier.waitForFirstPurge()
      purges.push(cleanupSoftDeletedUser(secondUser.id, cutoffDate))
      await barrier.waitForSerializedPurge(firstPurgeProcessId)
      expect(await getTestUserRaw(firstUser.id)).not.toBeNull()
      expect(await getTestUserRaw(secondUser.id)).not.toBeNull()
    } finally {
      // The barrier is disposed before draining either purge, including after an assertion fails.
      await Promise.all(purges)
    }
    await expect(Promise.all(purges)).resolves.toEqual([
      { deleted: 1, hasMore: false },
      { deleted: 1, hasMore: false },
    ])
    expect(await getTestUserRaw(firstUser.id)).toBeNull()
    expect(await getTestUserRaw(secondUser.id)).toBeNull()
  })
})
