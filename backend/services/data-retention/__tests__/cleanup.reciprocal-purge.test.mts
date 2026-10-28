import { describe, expect, it } from 'vitest'
import { createTestUserDirect, getTestUserRaw } from '@voucha/test-helpers'
import { createTestPostgresMultiWait } from '@voucha/test-helpers/postgres-multi-client-lock-observer'
import {
  holdTestFinalPurgeUserLifecycle,
  setReciprocalTestUserDeletionActors,
} from '../../../test-helpers/reciprocal-user-purge.mts'
import { cleanupSoftDeletedUser, FINAL_USER_PURGE_LOCK_KEY } from '../cleanup-soft-deleted-user.mts'

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
    await using barrier = await holdTestFinalPurgeUserLifecycle(firstUser.id)
    const holderProcessId = barrier.holderProcessId
    let released: Promise<void> | undefined
    const releaseHolder = () => (released ??= Promise.resolve(barrier[Symbol.asyncDispose]()))
    await using waits = await createTestPostgresMultiWait()
    const first = await waits.start(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'advisory', key: firstUser.id.toLowerCase() },
        queryMarker: 'cleanupSoftDeletedUserBatch:lockUser',
        releaseHolder,
      },
      () => cleanupSoftDeletedUser(firstUser.id, cutoffDate),
    )
    await first.waitForLock()
    const second = await waits.start(
      {
        holderProcessId: await first.waiterProcessId(),
        pool: 'write',
        lock: { kind: 'advisory', key: FINAL_USER_PURGE_LOCK_KEY },
        queryMarker: 'cleanupSoftDeletedUserBatch:serializeFinalPurges',
        releaseHolder,
      },
      () => cleanupSoftDeletedUser(secondUser.id, cutoffDate),
    )
    await second.waitForLock()
    expect(await getTestUserRaw(firstUser.id)).not.toBeNull()
    expect(await getTestUserRaw(secondUser.id)).not.toBeNull()
    await barrier.commit()
    await expect(Promise.all([first.operation, second.operation])).resolves.toEqual([
      { deleted: 1, hasMore: false },
      { deleted: 1, hasMore: false },
    ])
    expect(await getTestUserRaw(firstUser.id)).toBeNull()
    expect(await getTestUserRaw(secondUser.id)).toBeNull()
  })
})
