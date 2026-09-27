import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserSessionById } from '@voucha/test-helpers'
import { v7 } from 'uuid'
import { countTestWebUserAgents } from '../../test-helpers/entities/user-sessions.mts'
import { upsertAuthenticatedSession } from './user-sessions.mts'
import { runTestActionsAcrossUserAgentConflict } from '../../test-helpers/services/jwt-session/concurrent-user-agent.mts'

describe('authenticated session persistence', () => {
  it('persists both sessions across a concurrent first-use user-agent conflict', async () => {
    const user = await createTestUser()
    const firstSessionId = v7()
    const firstDeviceId = v7()
    const blockedSessionId = v7()
    const blockedDeviceId = v7()
    const userAgent = `session-user-agent-race-${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 60_000)

    const [firstSession, blockedSession] = await runTestActionsAcrossUserAgentConflict(
      queryOptions =>
        upsertAuthenticatedSession(
          user.id,
          { sid: firstSessionId, deviceId: firstDeviceId, expiresAt, userAgent },
          queryOptions,
        ),
      () =>
        upsertAuthenticatedSession(user.id, {
          sid: blockedSessionId,
          deviceId: blockedDeviceId,
          expiresAt,
          userAgent,
        }),
    )

    expect(firstSession).toMatchObject({
      id: firstSessionId,
      user_id: user.id,
      device_id: firstDeviceId,
      user_agent: userAgent,
    })
    expect(blockedSession).toMatchObject({
      id: blockedSessionId,
      user_id: user.id,
      device_id: blockedDeviceId,
      user_agent: userAgent,
    })
    await expect(getTestUserSessionById(firstSessionId)).resolves.toMatchObject({
      id: firstSessionId,
      user_id: user.id,
      user_agent: userAgent,
    })
    await expect(getTestUserSessionById(blockedSessionId)).resolves.toMatchObject({
      id: blockedSessionId,
      user_id: user.id,
      user_agent: userAgent,
    })
    await expect(countTestWebUserAgents(userAgent)).resolves.toBe(1)
  })

  it('rethrows an immediately rejected action and releases the user-agent holder', async () => {
    const user = await createTestUser()
    const firstSessionId = v7()
    const firstDeviceId = v7()
    const retrySessionId = v7()
    const retryDeviceId = v7()
    const userAgent = `session-user-agent-rejection-${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 60_000)
    const failure = new Error('blocked session failed')

    await expect(
      runTestActionsAcrossUserAgentConflict(
        queryOptions =>
          upsertAuthenticatedSession(
            user.id,
            { sid: firstSessionId, deviceId: firstDeviceId, expiresAt, userAgent },
            queryOptions,
          ),
        () => Promise.reject(failure),
      ),
    ).rejects.toBe(failure)

    await expect(
      upsertAuthenticatedSession(user.id, {
        sid: retrySessionId,
        deviceId: retryDeviceId,
        expiresAt,
        userAgent,
      }),
    ).resolves.toMatchObject({ id: retrySessionId })
  })

  it('keeps the early-success diagnostic for a non-blocking action', async () => {
    const user = await createTestUser()
    const userAgent = `session-user-agent-early-${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 60_000)

    await expect(
      runTestActionsAcrossUserAgentConflict(
        queryOptions =>
          upsertAuthenticatedSession(
            user.id,
            {
              sid: v7(),
              deviceId: v7(),
              expiresAt,
              userAgent,
            },
            queryOptions,
          ),
        async () => undefined,
      ),
    ).rejects.toThrow('Session upsert completed before waiting for the user-agent lock')
  })
})
