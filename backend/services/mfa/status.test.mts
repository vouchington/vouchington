import { describe, it, expect } from 'vitest'
import {
  createTestUserDirect,
  insertTestPasskey,
  insertTestTotpAuthenticator,
} from '@voucha/test-helpers'
import { getUserMfaStatus, userHasMfa } from './status.mts'

describe('getUserMfaStatus', () => {
  it('returns false for user with no MFA', async () => {
    const user = await createTestUserDirect()
    const status = await getUserMfaStatus(user.id)

    expect(status.hasMfa).toBe(false)
    expect(status.passkeysCount).toBe(0)
    expect(status.totpCount).toBe(0)
  }, 15_000)

  it('returns true for user with passkey', async () => {
    const user = await createTestUserDirect()
    const suffix = `mfa-passkey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await insertTestPasskey(user.id, suffix)

    const status = await getUserMfaStatus(user.id)

    expect(status.hasMfa).toBe(true)
    expect(status.passkeysCount).toBeGreaterThanOrEqual(1)
    expect(status.totpCount).toBe(0)
  }, 15_000)

  it('returns true for user with verified TOTP', async () => {
    const user = await createTestUserDirect()
    const suffix = `mfa-totp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await insertTestTotpAuthenticator(user.id, suffix)

    const status = await getUserMfaStatus(user.id)

    expect(status.hasMfa).toBe(true)
    expect(status.totpCount).toBeGreaterThanOrEqual(1)
    expect(status.passkeysCount).toBe(0)
  }, 15_000)

  it('counts both passkeys and TOTP independently', async () => {
    const user = await createTestUserDirect()
    const suffix = `mfa-both-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await insertTestPasskey(user.id, `passkey-${suffix}`)
    await insertTestTotpAuthenticator(user.id, `totp-${suffix}`)

    const status = await getUserMfaStatus(user.id)

    expect(status.hasMfa).toBe(true)
    expect(status.passkeysCount).toBeGreaterThanOrEqual(1)
    expect(status.totpCount).toBeGreaterThanOrEqual(1)
  }, 15_000)
})

describe('userHasMfa', () => {
  it('returns false for user with no MFA', async () => {
    const user = await createTestUserDirect()
    const result = await userHasMfa(user.id)
    expect(result).toBe(false)
  }, 15_000)

  it('returns true for user with passkey', async () => {
    const user = await createTestUserDirect()
    const suffix = `hasmfa-passkey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await insertTestPasskey(user.id, suffix)

    const result = await userHasMfa(user.id)
    expect(result).toBe(true)
  }, 15_000)

  it('returns true for user with verified TOTP', async () => {
    const user = await createTestUserDirect()
    const suffix = `hasmfa-totp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await insertTestTotpAuthenticator(user.id, suffix)

    const result = await userHasMfa(user.id)
    expect(result).toBe(true)
  }, 15_000)
})
