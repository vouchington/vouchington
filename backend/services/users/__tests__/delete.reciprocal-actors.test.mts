import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import {
  getTestUserDeletedById,
  holdTestRetainedUserIdentityLocks,
  listTestUserDeletionRequestActorIds,
} from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import { createTestPostgresMultiWait } from '@voucha/test-helpers/postgres-multi-client-lock-observer'
import { TestUserDeletionWriterAborted } from '@voucha/test-helpers/entities/user-deletion'
import { deleteUser } from '../delete.mts'
import { drainUserDeletionForTest } from '@voucha/test-helpers/services/users/delete-test-support'

describe('deleteUser reciprocal administrator deletions', () => {
  it('completes both deletions when two administrators delete each other concurrently', async () => {
    const [first, second] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: true }),
    ])
    // Hold both retained identities until one deletion is blocked on that key share and the
    // other is blocked behind it on a users-row lock. Abort and join that rollback before
    // awaiting the deletions so cleanup cannot race the open lock.
    const gate = await holdTestRetainedUserIdentityLocks([first.id, second.id])
    const aborted = gate.completed.then(
      () => {
        throw new Error('Expected the retained-identity lock to abort before cleanup')
      },
      (err: unknown) => {
        if (!(err instanceof TestUserDeletionWriterAborted)) throw err
      },
    )
    let releasing: Promise<void> | undefined
    const releaseGate = () =>
      (releasing ??= (async () => {
        gate.abort()
        await aborted
      })())
    await using waits = await createTestPostgresMultiWait()
    const direct = await waits.start(
      {
        holderProcessId: gate.holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: '/* createUserDeletionRequest:validateUsers */',
        releaseHolder: releaseGate,
      },
      () => deleteUser(first, second),
    )
    await direct.waitForLock()
    const indirect = await waits.start(
      {
        holderProcessId: await direct.waiterProcessId(),
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker:
          first.id.toLowerCase() < second.id.toLowerCase()
            ? '/* deleteUser:lockUserRow */'
            : '/* deleteUser:lockActorUserRow */',
        releaseHolder: releaseGate,
      },
      () => deleteUser(second, first),
    )
    await indirect.waitForLock()
    await releaseGate()
    const outcomes = await Promise.allSettled([direct.operation, indirect.operation])

    expect(outcomes.map(outcome => outcome.status)).toEqual(['fulfilled', 'fulfilled'])
    const [secondDeletion, firstDeletion] = outcomes.map(outcome =>
      outcome.status === 'fulfilled' ? outcome.value : null,
    )
    if (!secondDeletion || !firstDeletion) throw new Error('Expected both deletion attempts')
    expect((await getTestUserRaw(first.id))?.deleted_at).toBeInstanceOf(Date)
    expect((await getTestUserRaw(second.id))?.deleted_at).toBeInstanceOf(Date)
    expect(await getTestUserDeletedById(second.id)).toBe(first.id)
    expect(await getTestUserDeletedById(first.id)).toBe(second.id)
    expect(await listTestUserDeletionRequestActorIds(second.id)).toEqual([first.id])
    expect(await listTestUserDeletionRequestActorIds(first.id)).toEqual([second.id])

    await Promise.all([
      drainUserDeletionForTest(secondDeletion),
      drainUserDeletionForTest(firstDeletion),
    ])
  })
})
