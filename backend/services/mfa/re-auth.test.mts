import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestTotpAuthenticator,
  generateTestTotpCode,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { withReauthenticatedAccountChange } from './account-change.mts'
import { verifyTotpReAuth } from './totp-reauth.mts'
import {
  createTestAccountChangeActor,
  createTestAccountChangeProof,
  consumeTestAccountChangeProof,
} from '@voucha/test-helpers/account-change'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { withActiveAccountSession } from './active-account-session.mts'
import { verifyAndDeleteReAuthToken } from './re-auth.mts'

describe('session-scoped account-change proofs', () => {
  it('replaces only the issuing session proof and consumes it exactly once', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const other = await createTestAccountChangeActor(user.id)
    const replaced = await createTestAccountChangeProof(user.id, actor.session)
    const otherToken = await createTestAccountChangeProof(user.id, other.session)
    const token = await createTestAccountChangeProof(user.id, actor.session)

    await expect(consumeTestAccountChangeProof(user.id, actor.session, replaced)).resolves.toBe(
      false,
    )
    await expect(consumeTestAccountChangeProof(user.id, other.session, token)).resolves.toBe(false)
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(true)
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(false)
    await expect(consumeTestAccountChangeProof(user.id, other.session, otherToken)).resolves.toBe(
      true,
    )
  })

  it('restores the proof when its caller transaction rolls back', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const token = await createTestAccountChangeProof(user.id, actor.session)
    await withPostgresTransactionForTest(query =>
      withActiveAccountSession(
        user.id,
        actor.session,
        async owned => {
          await expect(
            verifyAndDeleteReAuthToken(user.id, actor.session, token, owned),
          ).resolves.toBe(true)
        },
        { query },
      ),
    )
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(true)
  })

  it('rejects malformed proof without consuming the valid proof', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const token = await createTestAccountChangeProof(user.id, actor.session)
    await expect(consumeTestAccountChangeProof(user.id, actor.session, 'not-a-uuid')).resolves.toBe(
      false,
    )
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(true)
  })
  it('keeps suspended settings and reauthentication blocked without burning the existing proof', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    await insertTestTotpAuthenticator(user.id, 'suspended-proof')
    const token = await createTestAccountChangeProof(user.id, actor.session)
    await suspendTestUser(user.id)
    let changed = false
    try {
      await expect(
        verifyTotpReAuth(user.id, actor.session, generateTestTotpCode()),
      ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' })
      await expect(
        withReauthenticatedAccountChange(user.id, actor.session, token, async () => {
          changed = true
        }),
      ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' })
      expect(changed).toBe(false)
    } finally {
      await unsuspendTestUser(user.id)
    }
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(true)
  })
})
