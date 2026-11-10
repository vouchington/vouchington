import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import {
  getTestUserDeletedById,
  listTestUserDeletionRequestActorIds,
} from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import { deleteUser } from '../delete.mts'
import { drainUserDeletionForTest } from '@voucha/test-helpers/services/users/delete-test-support'

describe('deleteUser reciprocal administrator deletions', () => {
  it('completes both deletions when two administrators delete each other concurrently', async () => {
    const [first, second] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: true }),
    ])
    const [secondDeletion, firstDeletion] = await Promise.all([
      deleteUser(first, second),
      deleteUser(second, first),
    ])

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
