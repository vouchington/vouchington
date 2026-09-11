import { it, expect, describe, vi } from 'vitest'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import { getJwtRevokedKey } from './constants.mts'
import { revokeSession, revokeSessions, isSessionRevoked } from './revocation.mts'
import { revokeSessionKeys, revokeUserSessionsBefore } from './session-revocation-keys.mts'
import { v7 } from 'uuid'

describe('revocation', () => {
  it('isSessionRevoked returns false for a session that has not been revoked', async () => {
    const sid = v7()
    const result = await isSessionRevoked(sid)
    expect(result).toBe(false)
  })

  it('revokeSession marks session as revoked', async () => {
    const sid = v7()

    await revokeSession(sid)
    const result = await isSessionRevoked(sid)
    expect(result).toBe(true)
  })

  it('revokeSession is idempotent', async () => {
    const sid = v7()

    await revokeSession(sid)
    await revokeSession(sid)
    expect(await isSessionRevoked(sid)).toBe(true)
  })

  it('keeps logout revocation available when registry writes fail best-effort', async () => {
    const sid = v7()

    await revokeSession(sid, {
      registryFailureMode: 'ignore',
      query: async () => {
        throw new Error('database unavailable')
      },
    })

    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('revoking one session does not affect another session', async () => {
    const sid1 = v7()
    const sid2 = v7()

    await revokeSession(sid1)
    expect(await isSessionRevoked(sid1)).toBe(true)
    expect(await isSessionRevoked(sid2)).toBe(false)
  })

  it('revokes multiple sessions through the batch helper', async () => {
    const sid1 = v7()
    const sid2 = v7()

    await revokeSessions([sid1, sid2])

    await expect(isSessionRevoked(sid1)).resolves.toBe(true)
    await expect(isSessionRevoked(sid2)).resolves.toBe(true)
  })

  it('uses the single-key path when revoking one session key', async () => {
    const sid = v7()

    await revokeSessionKeys([sid])

    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('fails closed instead of treating a null batch result as not revoked', async () => {
    const userId = v7()
    const sid = v7()

    const exec = vi.spyOn(sessionValkeyClient, 'exec').mockResolvedValueOnce(null)

    await expect(
      isSessionRevoked(sid, { userId, issuedAt: Math.floor(Date.now() / 1000) }),
    ).rejects.toThrow('isSessionRevoked: valkey batch exec returned no result')

    exec.mockRestore()
  })

  it('does not revoke replacement logins issued in the cutoff second', async () => {
    const userId = v7()
    const sid = v7()
    const cutoffSeconds = Math.floor(Date.now() / 1000)

    await revokeUserSessionsBefore(userId, cutoffSeconds)

    await expect(isSessionRevoked(sid, { userId, issuedAt: cutoffSeconds - 1 })).resolves.toBe(true)
    await expect(isSessionRevoked(sid, { userId, issuedAt: cutoffSeconds })).resolves.toBe(true)
    await expect(isSessionRevoked(sid, { userId, issuedAt: cutoffSeconds + 1 })).resolves.toBe(
      false,
    )
  })

  it('honors a direct session revocation while checking the user cutoff', async () => {
    const userId = v7()
    const sid = v7()
    const cutoffSeconds = Math.floor(Date.now() / 1000)

    await revokeSession(sid)
    await revokeUserSessionsBefore(userId, cutoffSeconds - 10)

    await expect(isSessionRevoked(sid, { userId, issuedAt: cutoffSeconds })).resolves.toBe(true)
  })

  it('keeps revocation flags for the longest supported session lifetime', async () => {
    const sid = v7()
    const expectedTtlSeconds = Math.max(
      SESSION_EXPIRATION_SECONDS,
      ATTESTED_SESSION_EXPIRATION_SECONDS,
    )

    await revokeSession(sid)

    const ttlSeconds = await sessionValkeyClient.ttl(getJwtRevokedKey(sid))
    expect(ttlSeconds).toBeGreaterThan(SESSION_EXPIRATION_SECONDS)
    expect(ttlSeconds).toBeLessThanOrEqual(expectedTtlSeconds)
    expect(ttlSeconds).toBeGreaterThan(expectedTtlSeconds - 60)
  })
})
