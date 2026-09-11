import { describe, it, expect, beforeAll } from 'vitest'
import * as OTPAuth from 'otpauth'
import {
  createTestUserDirect,
  getTotpAuthenticatorSecretCiphertext,
  getTotpAuthenticatorVerifiedAt,
  getTotpAuthenticatorName,
  totpAuthenticatorExists,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTotpAuthenticator,
  getTotpAuthenticatorsByUserId,
  verifyTotpSetup,
  renameTotpAuthenticator,
  deleteTotpAuthenticator,
} from './index.mts'

describe('TOTP service', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserDirect()
  }, 15_000)

  describe('createTotpAuthenticator', () => {
    it('returns setup data with secret and URI', async () => {
      const suffix = `create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const setupData = await createTotpAuthenticator(user.id, `Test ${suffix}`)

      expect(setupData.secret).toBeTruthy()
      expect(setupData.uri).toMatch(/^otpauth:\/\/totp\//)
      expect(setupData.authenticator.id).toBeTruthy()
      expect(setupData.authenticator.name).toBe(`Test ${suffix}`)
      expect(setupData.authenticator.created_at).toBeInstanceOf(Date)
    })

    it('created authenticator has verified_at = null', async () => {
      const suffix = `unverified-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const setupData = await createTotpAuthenticator(user.id, `Test ${suffix}`)

      const verifiedAt = await getTotpAuthenticatorVerifiedAt(setupData.authenticator.id)
      expect(verifiedAt).toBeNull()
    })

    it('stores the TOTP secret as encrypted ciphertext', async () => {
      const freshUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(freshUser.id, 'Encrypted Secret')
      const secretCiphertext = await getTotpAuthenticatorSecretCiphertext(
        setupData.authenticator.id,
      )

      expect(secretCiphertext).toMatch(/^v1:/)
      expect(secretCiphertext).not.toBe(setupData.secret)
      expect(secretCiphertext).not.toContain(setupData.secret)
    })

    it('throws 422 for invalid name (empty)', async () => {
      await expect(createTotpAuthenticator(user.id, '')).rejects.toMatchObject({ status: 422 })
    })

    it('throws 422 for name that exceeds 100 characters', async () => {
      await expect(createTotpAuthenticator(user.id, 'x'.repeat(101))).rejects.toMatchObject({
        status: 422,
      })
    })
  })

  describe('getTotpAuthenticatorsByUserId', () => {
    it('returns empty array when user has no verified authenticators', async () => {
      const freshUser = await createTestUserDirect()
      const { results: authenticators } = await getTotpAuthenticatorsByUserId(freshUser.id)
      expect(authenticators).toEqual([])
    })

    it('does not return unverified authenticators', async () => {
      const freshUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(freshUser.id, 'Unverified')

      const { results: authenticators } = await getTotpAuthenticatorsByUserId(freshUser.id)
      const found = authenticators.find(a => a.id === setupData.authenticator.id)
      expect(found).toBeUndefined()
    })

    it('returns verified authenticators after setup', async () => {
      const freshUser = await createTestUserDirect()
      const suffix = `verified-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const setupData = await createTotpAuthenticator(freshUser.id, `Test ${suffix}`)

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(setupData.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })
      const code = totp.generate()
      await verifyTotpSetup(freshUser.id, setupData.authenticator.id, code)

      const { results: authenticators } = await getTotpAuthenticatorsByUserId(freshUser.id)
      const found = authenticators.find(a => a.id === setupData.authenticator.id)
      expect(found).toBeDefined()
      expect(found!.name).toBe(`Test ${suffix}`)
    })
  })

  describe('verifyTotpSetup', () => {
    it('marks authenticator as verified', async () => {
      const freshUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(freshUser.id, 'My App')

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(setupData.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })
      const code = totp.generate()
      const result = await verifyTotpSetup(freshUser.id, setupData.authenticator.id, code)

      expect(result.id).toBe(setupData.authenticator.id)
      expect(result.name).toBe('My App')

      const verifiedAt = await getTotpAuthenticatorVerifiedAt(setupData.authenticator.id)
      expect(verifiedAt).not.toBeNull()
    })

    it('returns 401 for wrong code', async () => {
      const freshUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(freshUser.id, 'My App 2')

      await expect(
        verifyTotpSetup(freshUser.id, setupData.authenticator.id, '000000'),
      ).rejects.toMatchObject({ status: 401 })
    })

    it('returns 404 for non-existent authenticator', async () => {
      await expect(
        verifyTotpSetup(user.id, '00000000-0000-0000-0000-000000000001', '123456'),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('returns 422 if already verified', async () => {
      const freshUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(freshUser.id, 'Already Verified')

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(setupData.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })
      const code = totp.generate()
      await verifyTotpSetup(freshUser.id, setupData.authenticator.id, code)

      const code2 = totp.generate()
      await expect(
        verifyTotpSetup(freshUser.id, setupData.authenticator.id, code2),
      ).rejects.toMatchObject({ status: 422 })
    })
  })

  describe('renameTotpAuthenticator', () => {
    it('updates the name', async () => {
      const freshUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(freshUser.id, 'Original Name')

      await renameTotpAuthenticator(freshUser.id, setupData.authenticator.id, 'New Name')

      const name = await getTotpAuthenticatorName(setupData.authenticator.id)
      expect(name).toBe('New Name')
    })

    it('returns 404 for wrong user', async () => {
      const otherUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(otherUser.id, 'Other User App')

      await expect(
        renameTotpAuthenticator(user.id, setupData.authenticator.id, 'Stolen Name'),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('returns 404 for non-existent authenticator', async () => {
      await expect(
        renameTotpAuthenticator(user.id, '00000000-0000-0000-0000-000000000002', 'Name'),
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('deleteTotpAuthenticator', () => {
    it('removes the authenticator', async () => {
      const freshUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(freshUser.id, 'To Delete')

      await deleteTotpAuthenticator(freshUser.id, setupData.authenticator.id)

      const exists = await totpAuthenticatorExists(setupData.authenticator.id)
      expect(exists).toBe(false)
    })

    it('returns 404 for wrong user', async () => {
      const otherUser = await createTestUserDirect()
      const setupData = await createTotpAuthenticator(otherUser.id, 'Other User Delete')

      await expect(
        deleteTotpAuthenticator(user.id, setupData.authenticator.id),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('returns 404 for non-existent authenticator', async () => {
      await expect(
        deleteTotpAuthenticator(user.id, '00000000-0000-0000-0000-000000000003'),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
