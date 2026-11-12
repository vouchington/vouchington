import { describe, expect, it } from 'vitest'
import { createTestUserDirect, getTestUserRaw } from '@voucha/test-helpers'
import { createTestPostgresMultiWait } from '@voucha/test-helpers/postgres-multi-client-lock-observer'
import {
  holdTestFinalPurgeUserLifecycle,
  readReciprocalTestUserDeletionActor,
  setReciprocalTestUserDeletionActors,
} from '../../../test-helpers/reciprocal-user-purge.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('reciprocal final user purges', () => {
  it('commits the first reciprocal purge and rolls back the sibling snapshot', async () => {
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
        lock: { kind: 'advisory', key: 'data-retention:final-user-purge' },
        queryMarker: 'cleanupSoftDeletedUserBatch:serializeFinalPurges',
        releaseHolder,
      },
      () => cleanupSoftDeletedUser(secondUser.id, cutoffDate),
    )
    await second.waitForLock()
    expect(await getTestUserRaw(firstUser.id)).not.toBeNull()
    expect(await getTestUserRaw(secondUser.id)).not.toBeNull()
    await barrier.commit()
    const [firstResult, secondResult] = await Promise.allSettled([
      first.operation,
      second.operation,
    ])
    expect(firstResult).toEqual({ status: 'fulfilled', value: { deleted: 1, hasMore: false } })
    expect(secondResult).toMatchObject({ status: 'rejected', reason: { code: '40001' } })
    expect(await getTestUserRaw(firstUser.id)).toBeNull()
    expect(await getTestUserRaw(secondUser.id)).toMatchObject({
      id: secondUser.id,
      deleted_at: new Date('2020-01-01T00:00:00.000Z'),
    })
    expect(await readReciprocalTestUserDeletionActor(secondUser.id)).toBeNull()
  })
})
