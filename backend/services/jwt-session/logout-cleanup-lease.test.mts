import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { isSessionRevoked } from './revocation.mts'
import { logoutCleanupLease, runLogoutPushCleanupAndRevoke } from './logout-cleanup-lease.mts'
import { getJwtLogoutCleanupAdmissionKey } from './constants.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { v7 } from 'uuid'

describe('logout cleanup lease', () => {
  afterEach(() => vi.restoreAllMocks())

  it('releases an abandoned reservation so a replay can finish cleanup and revoke', async () => {
    const sid = v7()
    const abandoned = await logoutCleanupLease.reserve(sid, 30, 'abandoned-token')
    expect(abandoned).toEqual({ state: 'reserved', token: 'abandoned-token' })

    await expect(logoutCleanupLease.release(sid, 'abandoned-token')).resolves.toBe(true)

    let cleanupCalls = 0
    await runLogoutPushCleanupAndRevoke(
      sid,
      { userId: v7(), issuedAt: Math.floor(Date.now() / 1000) },
      async () => {
        cleanupCalls += 1
      },
    )

    expect(cleanupCalls).toBe(1)
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('fails a bounded wait without clearing the completion state, then a later replay recovers', async () => {
    const sid = v7()
    const owner = await logoutCleanupLease.reserve(sid, 90, 'stalled-owner')
    expect(owner).toEqual({ state: 'reserved', token: 'stalled-owner' })

    await expect(
      runLogoutPushCleanupAndRevoke(
        sid,
        { userId: v7(), issuedAt: Math.floor(Date.now() / 1000) },
        async () => {},
      ),
    ).rejects.toThrow('logout push cleanup is already in progress')
    await expect(isSessionRevoked(sid)).resolves.toBe(false)

    await logoutCleanupLease.release(sid, 'stalled-owner')
    let cleanupCalls = 0
    await runLogoutPushCleanupAndRevoke(
      sid,
      { userId: v7(), issuedAt: Math.floor(Date.now() / 1000) },
      async () => {
        cleanupCalls += 1
      },
    )
    expect(cleanupCalls).toBe(1)
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('cleans pre-revocation exact replays once when a bodyless owner commits the fence first', async () => {
    const sid = v7()
    const revocationOptions = { userId: v7(), issuedAt: Math.floor(Date.now() / 1000) }
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
    await vi.waitFor(async () => {
      await expect(sessionValkeyClient.get(getJwtLogoutCleanupAdmissionKey(sid))).resolves.toBe('3')
      await expect(isSessionRevoked(sid, revocationOptions)).resolves.toBe(false)
    })
    releaseBodylessCleanup()

    await Promise.all([bodyless, ...exactReplays])

    expect(cleanupCalls).toBe(1)
    await expect(isSessionRevoked(sid, revocationOptions)).resolves.toBe(true)
  })

  it('does not clean an exact binding admitted after the revocation fence', async () => {
    const sid = v7()
    const revocationOptions = { userId: v7(), issuedAt: Math.floor(Date.now() / 1000) }

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
    const sid = v7()
    const releaseError = new Error('release unavailable')
    const release = logoutCleanupLease.release
    vi.spyOn(logoutCleanupLease, 'release').mockImplementationOnce(async (sessionId, token) => {
      await release(sessionId, token)
      throw releaseError
    })

    await expect(
      runLogoutPushCleanupAndRevoke(
        sid,
        { userId: v7(), issuedAt: Math.floor(Date.now() / 1000) },
        async () => {},
      ),
    ).resolves.toBeUndefined()
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(releaseError, expect.any(Object))
  })

  it('does not mask a cleanup failure when release also fails', async () => {
    const sid = v7()
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
        { userId: v7(), issuedAt: Math.floor(Date.now() / 1000) },
        async () => {
          throw cleanupError
        },
      ),
    ).rejects.toBe(cleanupError)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(releaseError, expect.any(Object))
  })
})
