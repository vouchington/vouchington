import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import {
  getTestUserDeletedById,
  holdTestRetainedUserIdentityLocks,
  listTestUserDeletionAuditActorIds,
  waitForTestUserDeletionBackendsBlockedBehind,
} from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import { deleteUser } from '../delete.mts'
import { drainUserDeletionForTest } from '../delete-test-support.mts'

describe('deleteUser reciprocal administrator deletions', () => {
  it('completes both deletions when two administrators delete each other concurrently', async () => {
    const [first, second] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: true }),
    ])
    // Both deletions stall at the retained-identity foreign-key check that follows their `users`
    // row locks, so the formerly cyclic schedule is forced rather than left to timing.
    const gate = await holdTestRetainedUserIdentityLocks([first.id, second.id])
    const settled = Promise.allSettled([deleteUser(first, second), deleteUser(second, first)])
    try {
      await waitForTestUserDeletionBackendsBlockedBehind(gate.holderProcessId, 2)
    } finally {
      gate.release()
      await gate.completed
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
    expect(await listTestUserDeletionAuditActorIds(second.id)).toEqual([first.id])
    expect(await listTestUserDeletionAuditActorIds(first.id)).toEqual([second.id])

    await Promise.all([
      drainUserDeletionForTest(secondDeletion),
      drainUserDeletionForTest(firstDeletion),
    ])
  })
})
