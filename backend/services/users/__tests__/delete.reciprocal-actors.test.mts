import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import {
  getTestUserDeletedById,
  holdTestRetainedUserIdentityLocks,
  listTestUserDeletionRequestActorIds,
} from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import { waitForTestPostgresBlockedLockChain } from '@voucha/test-helpers/postgres-lock-observers'
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
    const settled = Promise.allSettled([deleteUser(first, second), deleteUser(second, first)])
    const aborted = gate.completed.then(
      () => {
        throw new Error('Expected the retained-identity lock to abort before cleanup')
      },
      (err: unknown) => {
        if (!(err instanceof TestUserDeletionWriterAborted)) throw err
      },
    )
    try {
      await waitForTestPostgresBlockedLockChain(
        gate.holderProcessId,
        '/* createUserDeletionRequest:validateUsers */',
        ['/* deleteUser:lockUserRow */', '/* deleteUser:lockActorUserRow */'],
      )
    } finally {
      gate.abort()
      await aborted
    }
    const outcomes = await settled

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
