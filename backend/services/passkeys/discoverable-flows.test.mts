import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  getTestPrivateUserById,
  insertTestPasskey,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import {
  getDiscoverablePasskeyAuthenticationOptions,
  issueDiscoverablePasskeyLogin,
  verifyDiscoverablePasskeyAuthentication,
} from './discoverable-flows.mts'
import { getAndDeleteChallenge } from './challenges.mts'

describe('discoverable passkey flows', () => {
  it('returns options with userVerification required and empty allowCredentials', async () => {
    const deviceId = `disc-opts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const options = await getDiscoverablePasskeyAuthenticationOptions(deviceId)

    expect(options.userVerification).toBe('required')
    expect(options.allowCredentials).toHaveLength(0)
    await expect(getAndDeleteChallenge(`passkey-discoverable-auth:${deviceId}`)).resolves.toBe(
      options.challenge,
    )
  })

  it('throws 400 when challenge has not been requested', async () => {
    const suffix = `disc-no-challenge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await expect(
      verifyDiscoverable(`no-challenge-device-${suffix}`, { id: 'fake' }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Authentication challenge expired or not found',
    })
  })

  it('throws 400 for response missing id field', async () => {
    const suffix = `disc-no-id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const deviceId = `no-id-device-${suffix}`
    await getDiscoverablePasskeyAuthenticationOptions(deviceId)

    await expect(verifyDiscoverable(deviceId, {})).rejects.toMatchObject({
      status: 400,
      message: 'Invalid authentication response',
    })
  })

  it('throws 401 for unknown credential (sign-in not sign-up guard)', async () => {
    const suffix = `disc-unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const deviceId = `unknown-device-${suffix}`
    await getDiscoverablePasskeyAuthenticationOptions(deviceId)

    await expect(
      verifyDiscoverable(deviceId, { id: `nonexistent-cred-${suffix}` }),
    ).rejects.toMatchObject({ status: 401, message: 'Passkey sign-in failed' })
  })

  it('throws 429 after 6 consecutive unknown-credential failures from the same device', async () => {
    const suffix = `disc-ratelimit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const deviceId = `ratelimit-device-${suffix}`
    for (let i = 0; i < 6; i++) {
      await getDiscoverablePasskeyAuthenticationOptions(deviceId)
      await expect(
        verifyDiscoverable(deviceId, { id: `nonexistent-${suffix}-${i}` }),
      ).rejects.toMatchObject({ status: 401 })
    }
    await getDiscoverablePasskeyAuthenticationOptions(deviceId)
    await expect(
      verifyDiscoverable(deviceId, { id: `nonexistent-${suffix}-7` }),
    ).rejects.toMatchObject({ status: 429 })
  }, 30_000)

  it('rejects empty deviceId while creating options', async () => {
    await expect(getDiscoverablePasskeyAuthenticationOptions('')).rejects.toMatchObject({
      status: 400,
      message: 'Device ID is required',
    })
  })

  it('rejects empty deviceId while verifying', async () => {
    await expect(verifyDiscoverable('', { id: 'fake' })).rejects.toMatchObject({
      status: 400,
      message: 'Device ID is required',
    })
  })

  it('throws 400 for empty sessionId', async () => {
    const suffix = `sid-guard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await expect(
      verifyDiscoverable(`guard-device-${suffix}`, { id: 'fake' }, ''),
    ).rejects.toMatchObject({ status: 400, message: 'Session ID is required' })
  })

  it('refuses to mint a session when the passkey account no longer exists', async () => {
    const passkeyUser = await createTestUser()
    const device = await createTestUser()

    await expect(
      issueDiscoverablePasskeyLogin({
        userId: passkeyUser.id,
        user: null,
        deviceId: device.id,
      }),
    ).rejects.toMatchObject({ status: 401, message: 'Passkey sign-in failed' })
  }, 20_000)

  it('refuses to mint a session when the loaded account is not the passkey user', async () => {
    const passkeyUser = await createTestUser()
    const loadedUser = await createTestUser()
    const device = await createTestUser()

    await expect(
      issueDiscoverablePasskeyLogin({
        userId: passkeyUser.id,
        user: loadedUser,
        deviceId: device.id,
      }),
    ).rejects.toMatchObject({ status: 401, message: 'Passkey sign-in failed' })
  }, 20_000)

  it('mints a session for the loaded passkey account', async () => {
    const user = await createTestUser()
    const device = await createTestUser()

    const result = await issueDiscoverablePasskeyLogin({
      userId: user.id,
      user,
      deviceId: device.id,
    })

    expect(result.userId).toBe(user.id)
    expect(result.sessionToken.payload.uid).toBe(user.id)
  }, 20_000)

  it('mints a session when the loaded passkey account is suspended', async () => {
    const user = await createTestUser()
    await suspendTestUser(user.id)
    const suspendedUser = (await getTestPrivateUserById(user.id))!
    const device = await createTestUser()

    const result = await issueDiscoverablePasskeyLogin({
      userId: user.id,
      user: suspendedUser,
      deviceId: device.id,
    })
    expect(result.userId).toBe(user.id)
    expect(result.sessionToken.payload.uid).toBe(user.id)

    await unsuspendTestUser(user.id)
  }, 20_000)

  it('returns 401 when verifyAuthenticationResponse throws (malformed assertion)', async () => {
    const user = await createTestUser()
    const suffix = `disc-malformed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await insertTestPasskey(user.id, suffix)
    const deviceId = `malformed-device-${suffix}`
    await getDiscoverablePasskeyAuthenticationOptions(deviceId)

    await expect(verifyDiscoverable(deviceId, { id: `cred-${suffix}` })).rejects.toMatchObject({
      status: 401,
      message: 'Passkey sign-in failed',
    })
  }, 15_000)
})

function verifyDiscoverable(deviceId: string, response: unknown, sessionId = `sid-${deviceId}`) {
  return verifyDiscoverablePasskeyAuthentication({
    fetchUser: async () => null,
    deviceId,
    sessionId,
    expectedOrigin: 'https://localhost:8787',
    response,
  })
}
