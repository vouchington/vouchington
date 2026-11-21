import { describe, expect, it } from 'vitest'
import { runInsideTestWorkerProcessor } from '@vouchington/worker-runtime/testing'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { addVerifiedEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import { userRowShareLockIsBlockedForTest } from '@voucha/test-helpers/entities/users-mutation-locks'
import { createTestVerifiedPasskeyRegistration } from '@voucha/test-helpers/passkey-registration'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { lockActiveUserSubjectsForMutation } from '../user-deletions/active-user-mutation-lock.mts'
import { lockOAuthAccountConnectionUser } from '../oauth-accounts/connect.mts'
import { createPasskey } from '../passkeys/create.mts'
import { deletePasskey } from '../passkeys/delete.mts'

/**
 * Two same-user writers that each hold a shared fence and then UPDATE the users row deadlock on
 * the lock upgrade. Writers of that row take the fence exclusively so the second one waits.
 */
describe('user fence mode for writers of the users row', () => {
  it('holds the passkey create and delete fences exclusively', async () => {
    const user = await createTestUser()
    await addVerifiedEmailForUser(user.id, `tests+fence-mode-${user.id}@voucha.ai`)
    const blockedAfterFence = async (statement: string, action: () => Promise<unknown>) => {
      let blocked: boolean | undefined
      const restore = afterPostgresTransactionQueryForTest(
        statement,
        values => values.includes(user.id),
        async () => {
          blocked = await userRowShareLockIsBlockedForTest(user.id)
        },
      )
      try {
        await runInsideTestWorkerProcessor(action)
      } finally {
        restore()
      }
      return blocked
    }

    let passkeyId = ''
    expect(
      await blockedAfterFence(
        'createPasskey */ SELECT fn_lock_active_user_for_mutation',
        async () => {
          passkeyId = (await createPasskey(user.id, createTestVerifiedPasskeyRegistration(), 'A'))
            .id
        },
      ),
    ).toBe(true)
    expect(
      await blockedAfterFence('deletePasskey */ SELECT fn_lock_active_user_for_mutation', () =>
        deletePasskey(user.id, passkeyId),
      ),
    ).toBe(true)
  })

  it('holds the oauth-connection fence exclusively', async () => {
    const user = await createTestUser()
    await using connection = await beginTransaction()
    await lockOAuthAccountConnectionUser(connection, user.id)
    expect(await userRowShareLockIsBlockedForTest(user.id)).toBe(true)
  })

  it('keeps the read-only fence shared', async () => {
    const user = await createTestUser()
    await using reader = await beginTransaction()
    await lockActiveUserSubjectsForMutation(reader, [user.id])
    expect(await userRowShareLockIsBlockedForTest(user.id)).toBe(false)
  })
})
