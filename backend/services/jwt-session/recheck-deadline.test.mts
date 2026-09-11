import { afterEach, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { isUUIDv7, signDeviceJwt, signSessionJwt } from '@ts-shared/session-jwt'
import { createTestUser, getTestPrivateUserById } from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from './create.mts'
import { refreshSessionState } from './flows.mts'
import { markJwtStale } from './invalidation.mts'
import { legacyUuidV4, signLegacyDeviceJwt, signLegacySessionJwt } from './test-helpers/index.mts'

describe('authenticated session recheck deadline', () => {
  afterEach(() => vi.useRealTimers())

  it('preserves the warm deadline and cold-refreshes at the original deadline', async () => {
    const user = await createTestUser()
    const startedAt = new Date('2026-01-01T00:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(startedAt)

    const initial = await createDeviceAndSessionTokens({ did: v7(), uid: user.id })
    const originalRca = initial.sessionToken.payload.rca!

    vi.setSystemTime(new Date(startedAt.getTime() + 29 * 60 * 1000))
    const warm = await refreshSessionState({
      deviceToken: initial.deviceToken.token,
      sessionToken: initial.sessionToken.token,
      fetchUser: getTestPrivateUserById,
    })

    expect(warm.session.rca).toBe(originalRca)
    expect(warm.session.sca).toBeGreaterThan(originalRca)

    vi.setSystemTime(new Date(startedAt.getTime() + 30 * 60 * 1000))
    const cold = await refreshSessionState({
      deviceToken: warm.dt,
      sessionToken: warm.st,
      fetchUser: getTestPrivateUserById,
    })

    expect(cold.session.rca).toBe(originalRca + 30 * 60)
  })

  it('cold-refreshes a legacy authenticated token that has no recheck deadline', async () => {
    const user = await createTestUser()
    const startedAt = new Date('2026-01-01T00:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(startedAt)

    const did = v7()
    const deviceToken = await signDeviceJwt({ did }, { expiresIn: '30 days' })
    const sessionToken = await signSessionJwt(
      { did, sid: v7(), uid: user.id, sca: Math.floor(startedAt.getTime() / 1000) + 60 * 60 },
      { expiresIn: '2 days' },
    )

    const refreshed = await refreshSessionState({
      deviceToken,
      sessionToken,
      fetchUser: getTestPrivateUserById,
    })

    expect(refreshed.st).not.toBe(sessionToken)
    expect(refreshed.session.rca).toBe(Math.floor(startedAt.getTime() / 1000) + 30 * 60)
  })

  it('preserves a future recheck deadline while rotating legacy device and session ids', async () => {
    const user = await createTestUser()
    const startedAt = new Date('2026-01-01T00:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(startedAt)

    const did = legacyUuidV4()
    const sid = legacyUuidV4()
    const rca = Math.floor(startedAt.getTime() / 1000) + 30 * 60
    const [deviceToken, sessionToken] = await Promise.all([
      signLegacyDeviceJwt({ did }),
      signLegacySessionJwt({ did, sid, uid: user.id, rca, sca: rca }),
    ])

    const refreshed = await refreshSessionState({
      deviceToken,
      sessionToken,
      fetchUser: getTestPrivateUserById,
    })

    expect(isUUIDv7(refreshed.did)).toBe(true)
    expect(isUUIDv7(refreshed.sid)).toBe(true)
    expect(refreshed.session.rca).toBe(rca)
  })

  it('cold-refreshes a second session at its original deadline after another clears the stale marker', async () => {
    const user = await createTestUser()
    const startedAt = new Date('2026-01-01T00:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(startedAt)

    const [first, second] = await Promise.all([
      createDeviceAndSessionTokens({ did: v7(), uid: user.id }),
      createDeviceAndSessionTokens({ did: v7(), uid: user.id }),
    ])
    const originalRca = first.sessionToken.payload.rca!
    expect(second.sessionToken.payload.rca).toBe(originalRca)

    vi.setSystemTime(new Date(startedAt.getTime() + 29 * 60 * 1000))
    await markJwtStale(user.id)
    const firstRefreshed = await refreshSessionState({
      deviceToken: first.deviceToken.token,
      sessionToken: first.sessionToken.token,
      fetchUser: getTestPrivateUserById,
    })
    expect(firstRefreshed.session.rca).toBe(originalRca + 29 * 60)

    vi.setSystemTime(new Date(startedAt.getTime() + 30 * 60 * 1000))
    let fetchCalls = 0
    const secondRefreshed = await refreshSessionState({
      deviceToken: second.deviceToken.token,
      sessionToken: second.sessionToken.token,
      fetchUser: async id => {
        fetchCalls += 1
        return getTestPrivateUserById(id)
      },
    })

    expect(fetchCalls).toBe(1)
    expect(secondRefreshed.session.rca).toBe(originalRca + 30 * 60)
  })
})
