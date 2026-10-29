import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  holdTestUserRowLock,
  isTestUserRowLocked,
} from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import type { PrivateUser } from '../types.mts'
import { deleteUser } from '../delete.mts'

async function createAdministratorsByAscendingId(): Promise<{
  lower: PrivateUser
  higher: PrivateUser
}> {
  const users = await Promise.all([
    createTestUser({ administrator: true }),
    createTestUser({ administrator: true }),
  ])
  const [lower, higher] = users.toSorted((left, right) => (left.id < right.id ? -1 : 1))
  if (!lower || !higher) throw new Error('Expected two administrators')
  return { lower, higher }
}

describe('deleteUser user-row lock order', () => {
  it('locks a lower-id actor before waiting on a higher-id target', async () => {
    const { lower: actor, higher: target } = await createAdministratorsByAscendingId()
    const holder = await holdTestUserRowLock(target.id)
    await withTestOwnedPostgresWait(
      {
        holderProcessId: holder.holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: '/* deleteUser:lockUserRow */',
        releaseHolder: async () => {
          holder.release()
          await holder.completed
        },
      },
      async waitForLock => {
        const deletion = deleteUser(actor, target)
        await waitForLock(deletion)
        expect(await isTestUserRowLocked(actor.id, 'update')).toBe(true)
        holder.release()
        await holder.completed
        await deletion
      },
    )
  })

  it('locks a lower-id target before waiting on a higher-id actor', async () => {
    const { lower: target, higher: actor } = await createAdministratorsByAscendingId()
    const holder = await holdTestUserRowLock(actor.id)
    await withTestOwnedPostgresWait(
      {
        holderProcessId: holder.holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: '/* deleteUser:lockActorUserRow */',
        releaseHolder: async () => {
          holder.release()
          await holder.completed
        },
      },
      async waitForLock => {
        const deletion = deleteUser(actor, target)
        await waitForLock(deletion)
        expect(await isTestUserRowLocked(target.id, 'update')).toBe(true)
        holder.release()
        await holder.completed
        await deletion
      },
    )
  })
})
