import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { isTestUserRowLocked } from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import { startPausedTestUserDeletionWriter } from '@voucha/test-helpers/entities/user-deletion'
import { lockUserDeletionRows } from '../delete-row-locks.mts'

async function holdDeletionRowLocks(targetUserId: string, requestedById: string) {
  return startPausedTestUserDeletionWriter(async query => {
    await lockUserDeletionRows(query, targetUserId, requestedById)
  })
}

describe('lockUserDeletionRows', () => {
  it('locks the target for update and the actor only against key changes', async () => {
    const [target, actor] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: true }),
    ])
    const held = await holdDeletionRowLocks(target.id, actor.id)
    try {
      expect(await isTestUserRowLocked(target.id, 'no-key-update')).toBe(true)
      // The actor is held FOR KEY SHARE: it blocks FOR UPDATE but not FOR NO KEY UPDATE, so a
      // reciprocal deletion can still take its own target row without waiting on this one.
      expect(await isTestUserRowLocked(actor.id, 'update')).toBe(true)
      expect(await isTestUserRowLocked(actor.id, 'no-key-update')).toBe(false)
    } finally {
      held.release()
      await held.completed
    }
  })

  it('locks a single row for update when a user deletes their own account', async () => {
    const user = await createTestUser()
    const held = await holdDeletionRowLocks(user.id, user.id)
    try {
      expect(await isTestUserRowLocked(user.id, 'no-key-update')).toBe(true)
    } finally {
      held.release()
      await held.completed
    }
  })

  it('rejects with a conflict when the target no longer exists', async () => {
    const actor = await createTestUser({ administrator: true })
    await expect(holdDeletionRowLocks(randomUUID(), actor.id)).rejects.toMatchObject({
      status: 409,
      message: 'User is already deleted',
    })
  })
})
