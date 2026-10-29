import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { describe, expect, it } from 'vitest'
import { createTestUser, getTestUserSessionById } from '@voucha/test-helpers'
import { v7 } from 'uuid'
import { countTestUserAgentStrings } from '../../test-helpers/entities/user-sessions.mts'
import { registerAuthenticatedSession } from './user-sessions.mts'
import { runTestActionsAcrossUserAgentConflict } from '@voucha/test-helpers/user-agent-conflict'

describe('authenticated session persistence', () => {
  it('persists both sessions across a concurrent first-use user-agent conflict', async () => {
    const user = await createTestUser()
    const firstSessionId = v7()
    const firstDeviceId = v7()
    const blockedSessionId = v7()
    const blockedDeviceId = v7()
    const userAgent = `session-user-agent-race-${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 60_000)

    await runTestActionsAcrossUserAgentConflict(
      queryOptions =>
        registerAuthenticatedSession(
          {
            sid: firstSessionId,
            uid: user.id,
            did: firstDeviceId,
            expiresAt,
            deviceContext: { user_agent: userAgent },
          },
          queryOptions,
        ),
      queryOptions =>
        registerAuthenticatedSession(
          {
            sid: blockedSessionId,
            uid: user.id,
            did: blockedDeviceId,
            expiresAt,
            deviceContext: { user_agent: userAgent },
          },
          queryOptions,
        ),
    )

    await expect(getTestUserSessionById(firstSessionId)).resolves.toMatchObject({
      id: firstSessionId,
      user_id: user.id,
      device_id: firstDeviceId,
      user_agent: userAgent,
    })
    await expect(getTestUserSessionById(blockedSessionId)).resolves.toMatchObject({
      id: blockedSessionId,
      user_id: user.id,
      device_id: blockedDeviceId,
      user_agent: userAgent,
    })
    await expect(countTestUserAgentStrings(userAgent)).resolves.toBe(1)
  })

  it('uses the shared lookup for empty and normalized session agents', async () => {
    const user = await createTestUser()
    const userAgent = `shared-agent-${crypto.randomUUID()}`
    const sharedId = await upsertUserAgentString(userAgent)
    expect(sharedId).toBeTruthy()
    for (const agent of [undefined, '   ', `  ${userAgent}  `]) {
      const sid = v7()
      await registerAuthenticatedSession({
        sid,
        uid: user.id,
        did: v7(),
        expiresAt: new Date(Date.now() + 60_000),
        deviceContext: { user_agent: agent },
      })
      await expect(getTestUserSessionById(sid)).resolves.toMatchObject({
        user_agent: agent?.trim() ?? '',
      })
    }
    await expect(countTestUserAgentStrings(userAgent)).resolves.toBe(1)
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
          registerAuthenticatedSession(
            {
              sid: firstSessionId,
              uid: user.id,
              did: firstDeviceId,
              expiresAt,
              deviceContext: { user_agent: userAgent },
            },
            queryOptions,
          ),
        () => Promise.reject(failure),
      ),
    ).rejects.toBe(failure)

    await registerAuthenticatedSession({
      sid: retrySessionId,
      uid: user.id,
      did: retryDeviceId,
      expiresAt,
      deviceContext: { user_agent: userAgent },
    })
    await expect(getTestUserSessionById(retrySessionId)).resolves.toMatchObject({
      id: retrySessionId,
      device_id: retryDeviceId,
    })
  })

  it('keeps the early-success diagnostic for a non-blocking action', async () => {
    const user = await createTestUser()
    const userAgent = `session-user-agent-early-${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 60_000)

    await expect(
      runTestActionsAcrossUserAgentConflict(
        queryOptions =>
          registerAuthenticatedSession(
            {
              sid: v7(),
              uid: user.id,
              did: v7(),
              expiresAt,
              deviceContext: { user_agent: userAgent },
            },
            queryOptions,
          ),
        async () => undefined,
      ),
    ).rejects.toThrow('Session upsert completed before waiting for the user-agent lock')
  })
})
