import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { isSessionRevoked } from './revocation.mts'
import { logoutCleanupLease, runLogoutPushCleanupAndRevoke } from './logout-cleanup-lease.mts'
import { revokeSessionForLogout } from './web-refresh.mts'
import {
  admitLogoutCleanupScript,
  getJwtLogoutCleanupAdmissionKey,
  getJwtLogoutCleanupFenceKey,
  getJwtRevokedKey,
} from './constants.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { v7 } from 'uuid'
import { createTestSessionCookies } from '@voucha/test-helpers/services/jwt-session/index'
import { withLogoutCleanupClock } from '../../test-helpers/logout-cleanup-clock.mts'

describe('logout cleanup lease', () => {
  afterEach(() => vi.restoreAllMocks())

  it('releases an abandoned reservation so a replay can finish cleanup and revoke', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const abandoned = await logoutCleanupLease.reserve(sid, 30, 'abandoned-token')
    expect(abandoned).toEqual({ state: 'reserved', token: 'abandoned-token' })

    await expect(logoutCleanupLease.release(sid, 'abandoned-token')).resolves.toBe(true)

    let cleanupCalls = 0
    await runLogoutPushCleanupAndRevoke(
      sid,
      { userId, issuedAt: Math.floor(Date.now() / 1000) },
      async () => {
        cleanupCalls += 1
      },
    )

    expect(cleanupCalls).toBe(1)
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('durably revokes after a bounded wait and refuses a new cleanup admission', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const owner = await logoutCleanupLease.reserve(sid, 90, 'stalled-owner')
    expect(owner).toEqual({ state: 'reserved', token: 'stalled-owner' })

    await expect(
      withLogoutCleanupClock(() =>
        runLogoutPushCleanupAndRevoke(
          sid,
          { userId, issuedAt: Math.floor(Date.now() / 1000) },
          async () => {},
        ),
      ),
    ).rejects.toThrow('logout push cleanup is already in progress')
    await expect(isSessionRevoked(sid)).resolves.toBe(true)

    await logoutCleanupLease.release(sid, 'stalled-owner')
    let cleanupCalls = 0
    await runLogoutPushCleanupAndRevoke(
      sid,
      { userId, issuedAt: Math.floor(Date.now() / 1000) },
      async () => {
        cleanupCalls += 1
      },
    )
    expect(cleanupCalls).toBe(0)
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('cleans pre-revocation exact replays once when a bodyless owner commits the fence first', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const revocationOptions = { userId, issuedAt: Math.floor(Date.now() / 1000) }
    const binding = {
      endpoint: `https://push.example.test/${crypto.randomUUID()}`,
      subscriptionId: v7(),
    }
    let releaseBodylessCleanup!: () => void
    let signalBodylessCleanupStarted!: () => void
    const bodylessCleanupStarted = new Promise<void>(resolve => {
      signalBodylessCleanupStarted = resolve
    })
    const bodylessCleanupReleased = new Promise<void>(resolve => {
      releaseBodylessCleanup = resolve
    })

    const invokeScript = sessionValkeyClient.invokeScript
    let admissions = 0
    const thirdAdmission = Promise.withResolvers<void>()
    vi.spyOn(sessionValkeyClient, 'invokeScript').mockImplementation((...args) => {
      const result = invokeScript.call(sessionValkeyClient, ...args)
      if (args[0] === admitLogoutCleanupScript) {
        admissions += 1
        if (admissions === 3) {
          void Promise.resolve(result).then(
            () => thirdAdmission.resolve(),
            () => thirdAdmission.resolve(),
          )
        }
      }
      return result
    })

    const bodyless = runLogoutPushCleanupAndRevoke(sid, revocationOptions, async () => {
      signalBodylessCleanupStarted()
      await bodylessCleanupReleased
    })
    await bodylessCleanupStarted

    let cleanupCalls = 0
    const exactReplays = [
      runLogoutPushCleanupAndRevoke(
        sid,
        revocationOptions,
        async () => {
          cleanupCalls += 1
        },
        binding,
      ),
      runLogoutPushCleanupAndRevoke(
        sid,
        revocationOptions,
        async () => {
          cleanupCalls += 1
        },
        binding,
      ),
    ]
    await thirdAdmission.promise
    await expect(sessionValkeyClient.get(getJwtLogoutCleanupAdmissionKey(sid))).resolves.toBe('3')
    await expect(isSessionRevoked(sid, revocationOptions)).resolves.toBe(false)
    releaseBodylessCleanup()

    await Promise.all([bodyless, ...exactReplays])

    expect(cleanupCalls).toBe(1)
    await expect(isSessionRevoked(sid, revocationOptions)).resolves.toBe(true)
  })

  it('does not clean an exact binding admitted after the revocation fence', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const revocationOptions = { userId, issuedAt: Math.floor(Date.now() / 1000) }

    await runLogoutPushCleanupAndRevoke(sid, revocationOptions, async () => {})

    let cleanupCalls = 0
    await runLogoutPushCleanupAndRevoke(
      sid,
      revocationOptions,
      async () => {
        cleanupCalls += 1
      },
      {
        endpoint: `https://push.example.test/${crypto.randomUUID()}`,
        subscriptionId: v7(),
      },
    )

    expect(cleanupCalls).toBe(0)
  })

  it('does not issue a cleanup capability after durable revocation when cache state is lost', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const options = { userId, issuedAt: Math.floor(Date.now() / 1000) }
    await runLogoutPushCleanupAndRevoke(sid, options, async () => {})
    await sessionValkeyClient.unlink([
      getJwtLogoutCleanupAdmissionKey(sid),
      getJwtLogoutCleanupFenceKey(sid),
      getJwtRevokedKey(sid),
    ])
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    await runLogoutPushCleanupAndRevoke(sid, options, cleanup, {
      endpoint: `https://push.example.test/${crypto.randomUUID()}`,
      subscriptionId: v7(),
    })
    expect(cleanup).not.toHaveBeenCalled()
    await expect(isSessionRevoked(sid, options)).resolves.toBe(true)
  })

  it('durably revokes and reports an unavailable admission cache without running cleanup', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const error = new Error('admission unavailable')
    const invoke = sessionValkeyClient.invokeScript
    vi.spyOn(sessionValkeyClient, 'invokeScript').mockImplementation((...args) =>
      args[0] === admitLogoutCleanupScript
        ? Promise.reject(error)
        : invoke.call(sessionValkeyClient, ...args),
    )
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const onFallbackRevoked = vi.fn<() => void>()
    await expect(
      runLogoutPushCleanupAndRevoke(
        sid,
        { userId },
        cleanup,
        undefined,
        undefined,
        onFallbackRevoked,
      ),
    ).rejects.toBe(error)
    expect(cleanup).not.toHaveBeenCalled()
    expect(onFallbackRevoked).toHaveBeenCalledOnce()
    await sessionValkeyClient.unlink([getJwtRevokedKey(sid)])
    await expect(isSessionRevoked(sid, { userId })).resolves.toBe(true)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, expect.any(Object))
  })

  it('leaves signed-device fallback available when the first revocation attempt fails', async () => {
    const { dtCookie, stCookie, sid, userId } = await createTestSessionCookies()
    const error = new Error('admission unavailable')
    const invoke = sessionValkeyClient.invokeScript
    vi.spyOn(sessionValkeyClient, 'invokeScript').mockImplementation((...args) =>
      args[0] === admitLogoutCleanupScript
        ? Promise.reject(error)
        : invoke.call(sessionValkeyClient, ...args),
    )
    vi.spyOn(sessionValkeyClient, 'set').mockRejectedValueOnce(
      new Error('revocation marker unavailable'),
    )
    const onFallbackRevoked = vi.fn<() => void>()

    await expect(
      runLogoutPushCleanupAndRevoke(
        sid,
        { userId },
        async () => {},
        undefined,
        undefined,
        onFallbackRevoked,
      ),
    ).rejects.toBe(error)
    expect(onFallbackRevoked).not.toHaveBeenCalled()

    await revokeSessionForLogout({
      deviceToken: dtCookie.slice(3),
      sessionToken: stCookie.slice(3),
    })
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('does not let an expired owner release its replacement lease', async () => {
    const sid = v7()
    const first = await logoutCleanupLease.reserve(sid, 30, 'first-token')
    expect(first).toEqual({ state: 'reserved', token: 'first-token' })

    // Simulate expiry without waiting for wall-clock TTL, then let a replay reserve the key.
    await sessionValkeyClient.unlink([logoutCleanupLease.keyFor(sid)])
    const replacement = await logoutCleanupLease.reserve(sid, 30, 'replacement-token')
    expect(replacement).toEqual({ state: 'reserved', token: 'replacement-token' })

    await expect(logoutCleanupLease.release(sid, 'first-token')).resolves.toBe(false)
    await expect(sessionValkeyClient.get(logoutCleanupLease.keyFor(sid))).resolves.toBe(
      'processing:replacement-token',
    )
    await expect(logoutCleanupLease.release(sid, 'replacement-token')).resolves.toBe(true)
  })

  it('reports a release failure without masking a successful logout', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const releaseError = new Error('release unavailable')
    const release = logoutCleanupLease.release
    vi.spyOn(logoutCleanupLease, 'release').mockImplementationOnce(async (sessionId, token) => {
      await release(sessionId, token)
      throw releaseError
    })

    await expect(
      runLogoutPushCleanupAndRevoke(
        sid,
        { userId, issuedAt: Math.floor(Date.now() / 1000) },
        async () => {},
      ),
    ).resolves.toBeUndefined()
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(releaseError, expect.any(Object))
  })

  it('does not mask a cleanup failure when release also fails', async () => {
    const { sid, userId } = await createTestSessionCookies()
    const cleanupError = new Error('cleanup unavailable')
    const releaseError = new Error('release unavailable')
    const release = logoutCleanupLease.release
    vi.spyOn(logoutCleanupLease, 'release').mockImplementationOnce(async (sessionId, token) => {
      await release(sessionId, token)
      throw releaseError
    })

    await expect(
      runLogoutPushCleanupAndRevoke(
        sid,
        { userId, issuedAt: Math.floor(Date.now() / 1000) },
        async () => {
          throw cleanupError
        },
      ),
    ).rejects.toBe(cleanupError)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(releaseError, expect.any(Object))
    await sessionValkeyClient.unlink([getJwtRevokedKey(sid)])
    await expect(isSessionRevoked(sid, { userId })).resolves.toBe(true)
  })
})
