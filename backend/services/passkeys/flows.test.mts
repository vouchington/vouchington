import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthError, type AuthErrorCode } from '@vouchington/auth'
import { createTestUser, insertTestPasskey } from '@voucha/test-helpers'
import {
  getPasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
} from './authentication-flows.mts'
import { getAndDeleteChallenge } from './challenges.mts'
import { RP_ID } from './config.mts'
import { getPasskeyRegistrationOptions, verifyPasskeyRegistration } from './flows.mts'
import { passkeyProtocol } from './protocol.mts'

const origin = 'https://localhost:8787'
const authError = (code: AuthErrorCode) => new AuthError(code, 400, code)
const verifyRegistration = (name = 'My Passkey') =>
  verifyPasskeyRegistration('user-id', 'device-id', origin, {}, name)
const verifyAuthentication = (userId: string, response: unknown) =>
  verifyPasskeyAuthentication(userId, 'device-id', origin, response)

describe('passkey flows', () => {
  afterEach(() => vi.restoreAllMocks())

  describe('registration', () => {
    it('rejects an expired challenge', async () => {
      await expect(verifyRegistration()).rejects.toMatchObject({
        status: 400,
        message: 'Registration challenge expired or not found',
      })
    })

    it.each(['   ', 'x'.repeat(101)])('rejects invalid name %#', async name => {
      await expect(verifyRegistration(name)).rejects.toMatchObject({ status: 422 })
    })

    it('preserves deployed policy and state key', async () => {
      const user = await createTestUser()
      const deviceId = `registration-key-${Date.now()}`
      const options = await getPasskeyRegistrationOptions(user, deviceId)

      expect(options).toMatchObject({
        rp: { id: RP_ID, name: 'Voucha' },
        timeout: 60_000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      })
      expect(options.pubKeyCredParams.map(({ alg }) => alg)).toEqual([-8, -7, -257])
      expect(Buffer.from(options.user.id, 'base64url')).toEqual(Buffer.from(user.id))
      await expect(getAndDeleteChallenge(`passkey-reg:${user.id}:${deviceId}`)).resolves.toBe(
        options.challenge,
      )
    })

    it('maps engine failures', async () => {
      const verify = vi.spyOn(passkeyProtocol.registration, 'verify')
      verify.mockRejectedValueOnce(authError('invalid_credentials'))
      await expect(verifyRegistration()).rejects.toMatchObject({
        status: 400,
        message: 'Registration verification failed',
      })
      const failure = new Error('unexpected')
      verify.mockRejectedValueOnce(failure)
      await expect(verifyRegistration()).rejects.toBe(failure)
    })
  })

  describe('authentication', () => {
    it('preserves the deployed state key', async () => {
      const user = await createTestUser()
      const suffix = `authentication-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
      await insertTestPasskey(user.id, suffix)
      const deviceId = `authentication-device-${suffix}`
      const options = await getPasskeyAuthenticationOptions(user.id, deviceId)

      await expect(getAndDeleteChallenge(`passkey-auth:${user.id}:${deviceId}`)).resolves.toBe(
        options.challenge,
      )
    })

    it('maps option failures', async () => {
      const createOptions = vi.spyOn(passkeyProtocol.authentication, 'createOptions')
      createOptions.mockRejectedValueOnce(authError('invalid_request'))
      await expect(getPasskeyAuthenticationOptions('user-id', 'device-id')).rejects.toMatchObject({
        status: 400,
        message: 'No passkeys registered for this user',
      })
      const failure = new Error('unexpected')
      createOptions.mockRejectedValueOnce(failure)
      await expect(getPasskeyAuthenticationOptions('user-id', 'device-id')).rejects.toBe(failure)
    })

    it('maps verification results', async () => {
      const verify = vi.spyOn(passkeyProtocol.authentication, 'verify')
      verify.mockResolvedValueOnce({ userId: 'user-id', passkeyId: 'passkey-id' })
      await expect(verifyAuthentication('user-id', {})).resolves.toEqual({
        verified: true,
        passkeyId: 'passkey-id',
      })

      for (const error of [new Error('unexpected'), authError('invalid_request')]) {
        verify.mockRejectedValueOnce(error)
        await expect(verifyAuthentication('user-id', {})).rejects.toBe(error)
      }
      verify.mockRejectedValueOnce(authError('challenge_expired'))
      await expect(verifyAuthentication('user-id', {})).rejects.toMatchObject({
        status: 400,
        message: 'Authentication challenge expired or not found',
      })
      verify.mockRejectedValueOnce(authError('invalid_credentials'))
      await expect(verifyAuthentication('user-id', { id: 'unknown' })).rejects.toMatchObject({
        status: 400,
        message: 'Passkey not found',
      })

      const user = await createTestUser()
      const suffix = `authentication-failure-${Date.now()}`
      const passkey = await insertTestPasskey(user.id, suffix)
      verify.mockRejectedValueOnce(authError('invalid_credentials'))
      await expect(verifyAuthentication(user.id, { id: `cred-${suffix}` })).resolves.toEqual({
        verified: false,
        passkeyId: passkey.id,
      })
    })
  })
})
