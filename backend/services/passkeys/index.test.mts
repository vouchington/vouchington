import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, createTestUserDirect, insertTestPasskey } from '@voucha/test-helpers'
import {
  getPasskeysByUserId,
  getPasskeyCredentialIdsByUserId,
  getPasskeyByCredentialId,
  renamePasskey,
  deletePasskey,
  updatePasskeyCounter,
  storeChallenge,
  getAndDeleteChallenge,
} from './index.mts'
describe('Passkeys Service', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser()
    userId = user!.id
  }, 15_000)
  describe('getPasskeysByUserId', () => {
    it('returns empty array for user with no passkeys', async () => {
      const { results: passkeys } = await getPasskeysByUserId(userId)
      expect(passkeys).toEqual([])
    })

    it('returns passkeys for a user', async () => {
      const passkey = await insertTestPasskey(
        userId,
        `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      )
      const { results: passkeys } = await getPasskeysByUserId(userId)
      expect(passkeys.length).toBeGreaterThanOrEqual(1)
      const found = passkeys.find(p => p.id === passkey.id)
      expect(found).toBeDefined()
      expect(found!.name).toBe(passkey.name)
    })
  })

  describe('getPasskeyCredentialIdsByUserId', () => {
    it('returns credential ids (not full passkey objects)', async () => {
      const suffix = `credids-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await insertTestPasskey(userId, suffix)
      const ids = await getPasskeyCredentialIdsByUserId(userId)
      expect(Array.isArray(ids)).toBe(true)
      expect(ids.every(id => typeof id === 'string')).toBe(true)
      expect(ids).toContain(`cred-${suffix}`)
    })
  })

  describe('renamePasskey', () => {
    it('renames a passkey', async () => {
      const suffix = `rename-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const passkey = await insertTestPasskey(userId, suffix)

      await renamePasskey(userId, passkey.id, 'New Name')

      const { results: passkeys } = await getPasskeysByUserId(userId)
      const found = passkeys.find(p => p.id === passkey.id)
      expect(found!.name).toBe('New Name')
    })

    it('throws 404 for non-existent passkey', async () => {
      await expect(
        renamePasskey(userId, '00000000-0000-0000-0000-000000000001', 'New Name'),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('throws 404 when passkey belongs to different user', async () => {
      const otherUser = await createTestUser()
      const suffix = `rename-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const passkey = await insertTestPasskey(otherUser!.id, suffix)

      await expect(renamePasskey(userId, passkey.id, 'New Name')).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe('updatePasskeyCounter', () => {
    it('only advances the stored signature counter', async () => {
      const suffix = `counter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const passkey = await insertTestPasskey(userId, suffix)

      await expect(updatePasskeyCounter(passkey.id, 0)).resolves.toBe(true)
      await expect(updatePasskeyCounter(passkey.id, 100)).resolves.toBe(true)
      await expect(updatePasskeyCounter(passkey.id, 99)).resolves.toBe(false)

      await expect(getPasskeyByCredentialId(`cred-${suffix}`)).resolves.toMatchObject({
        counter: 100,
      })
      const { results } = await getPasskeysByUserId(userId)
      expect(results.find(({ id }) => id === passkey.id)?.last_used_at).toBeInstanceOf(Date)
    })
  })

  describe('deletePasskey', () => {
    it('deletes a passkey when user has other auth methods', async () => {
      // User created with email (via createTestUser) so they have other auth methods
      const suffix = `delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const passkey = await insertTestPasskey(userId, suffix)

      await deletePasskey(userId, passkey.id)

      const { results: passkeys } = await getPasskeysByUserId(userId)
      const found = passkeys.find(p => p.id === passkey.id)
      expect(found).toBeUndefined()
    })

    it('throws 404 for non-existent passkey', async () => {
      await expect(
        deletePasskey(userId, '00000000-0000-0000-0000-000000000002'),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('allows deleting the last passkey (passkeys are MFA-only)', async () => {
      // Passkeys are MFA-only — users always have a primary auth method (email/OAuth)
      // so deleting the last passkey must never be blocked
      const passkeyOnlyUser = await createTestUserDirect()
      const suffix = `last-passkey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const passkey = await insertTestPasskey(passkeyOnlyUser!.id, suffix)

      await expect(deletePasskey(passkeyOnlyUser!.id, passkey.id)).resolves.toBeUndefined()
    })
  })

  describe('challenges', () => {
    it('stores and atomically consumes a challenge once', async () => {
      const key = `test-challenge-${Date.now()}`
      const challenge = 'test-challenge-value'

      await storeChallenge(key, challenge)
      await expect(getAndDeleteChallenge(key)).resolves.toBe(challenge)
      await expect(getAndDeleteChallenge(key)).resolves.toBeNull()
      await expect(getAndDeleteChallenge('non-existent-challenge-key')).resolves.toBeNull()
    })
  })
})
