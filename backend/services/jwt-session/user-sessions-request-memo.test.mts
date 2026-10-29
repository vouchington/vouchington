import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { runWithRequestContext } from '@modules/utils/request-context'
import { createTestUser, getTestUserSessionById } from '@voucha/test-helpers'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import { runSessionActionWithRolledBackQuery } from '../../test-helpers/session-user-agent-rollback.mts'
import { registerAuthenticatedSession } from './user-sessions.mts'
import { cleanupOrphanedUserAgentStrings } from '../data-retention/cleanup-user-agent-strings.mts'
import {
  countTestUserAgentStrings,
  deleteTestUserSession,
} from '../../test-helpers/entities/user-sessions.mts'

const expiresAt = new Date('2030-01-01T00:00:00.000Z')

describe('request-local session user-agent memo', () => {
  it('recreates a memoized agent deleted after the preceding session committed', async () => {
    const user = await createTestUser()
    const userAgent = `expired-memo-agent-${crypto.randomUUID()}`
    const firstSessionId = v7()
    const secondSessionId = v7()
    const afterAgeGuard = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000)

    await runWithRequestContext(async () => {
      await registerAuthenticatedSession({
        sid: firstSessionId,
        uid: user.id,
        did: v7(),
        expiresAt,
        deviceContext: { user_agent: userAgent },
      })
      const firstAgentId = await upsertUserAgentString(userAgent)
      if (!firstAgentId) throw new Error('First session agent is missing')
      await deleteTestUserSession(firstSessionId)
      expect(await cleanupOrphanedUserAgentStrings(1, [firstAgentId], afterAgeGuard)).toMatchObject(
        {
          deleted: 1,
        },
      )

      await registerAuthenticatedSession({
        sid: secondSessionId,
        uid: user.id,
        did: v7(),
        expiresAt,
        deviceContext: { user_agent: userAgent },
      })
      expect(await upsertUserAgentString(userAgent)).not.toBe(firstAgentId)
    })

    expect(await countTestUserAgentStrings(userAgent)).toBe(1)
    await expect(getTestUserSessionById(secondSessionId)).resolves.toMatchObject({
      id: secondSessionId,
      user_agent: userAgent,
    })
  })

  it('looks up a warm normalized agent once for two registrations in one request', async () => {
    const user = await createTestUser()
    const userAgent = `warm-session-agent-${crypto.randomUUID()}`
    await upsertUserAgentString(userAgent)
    const firstSessionId = v7()
    const secondSessionId = v7()

    const { queries } = await withCapturedTestQueries(() =>
      runWithRequestContext(async () => {
        await registerAuthenticatedSession({
          sid: firstSessionId,
          uid: user.id,
          did: v7(),
          expiresAt,
          deviceContext: { user_agent: `  ${userAgent}  ` },
        })
        await registerAuthenticatedSession({
          sid: secondSessionId,
          uid: user.id,
          did: v7(),
          expiresAt,
          deviceContext: { user_agent: userAgent },
        })
      }),
    )

    expect(countCapturedQueriesByAnnotation(queries, 'upsertUserAgentString')).toBe(1)
    await expect(getTestUserSessionById(firstSessionId)).resolves.toMatchObject({
      user_id: user.id,
      user_agent: userAgent,
    })
    await expect(getTestUserSessionById(secondSessionId)).resolves.toMatchObject({
      user_id: user.id,
      user_agent: userAgent,
    })
  })

  it('looks up the same warm agent independently in separate requests', async () => {
    const user = await createTestUser()
    const userAgent = `separate-session-agent-${crypto.randomUUID()}`
    await upsertUserAgentString(userAgent)

    for (const sid of [v7(), v7()]) {
      const { queries } = await withCapturedTestQueries(() =>
        runWithRequestContext(() =>
          registerAuthenticatedSession({
            sid,
            uid: user.id,
            did: v7(),
            expiresAt,
            deviceContext: { user_agent: userAgent },
          }),
        ),
      )
      expect(countCapturedQueriesByAnnotation(queries, 'upsertUserAgentString')).toBe(1)
      await expect(getTestUserSessionById(sid)).resolves.toMatchObject({ user_agent: userAgent })
    }
  })

  it('does not read a warm request memo from explicit query or client paths', async () => {
    const user = await createTestUser()
    const userAgent = `borrowed-session-agent-${crypto.randomUUID()}`
    await upsertUserAgentString(userAgent)

    await runWithRequestContext(async () => {
      await registerAuthenticatedSession({
        sid: v7(),
        uid: user.id,
        did: v7(),
        expiresAt,
        deviceContext: { user_agent: userAgent },
      })

      for (const useClient of [false, true]) {
        const sid = v7()
        const { queries } = await withCapturedTestQueries(() =>
          runSessionActionWithRolledBackQuery(
            queryOptions =>
              registerAuthenticatedSession(
                {
                  sid,
                  uid: user.id,
                  did: v7(),
                  expiresAt,
                  deviceContext: { user_agent: userAgent },
                },
                queryOptions,
              ),
            useClient,
          ),
        )
        expect(countCapturedQueriesByAnnotation(queries, 'upsertUserAgentString')).toBe(1)
        const session = await getTestUserSessionById(sid)
        expect(session?.id ?? null).toBe(useClient ? sid : null)
        expect(session?.user_agent ?? null).toBe(useClient ? userAgent : null)
      }
    })
  })

  it('does not populate the request memo from explicit query or client paths', async () => {
    const user = await createTestUser()

    for (const useClient of [false, true]) {
      const userAgent = `uncached-session-agent-${crypto.randomUUID()}`
      const directSessionId = v7()
      const sessionId = v7()

      await runWithRequestContext(async () => {
        await runSessionActionWithRolledBackQuery(
          queryOptions =>
            registerAuthenticatedSession(
              {
                sid: directSessionId,
                uid: user.id,
                did: v7(),
                expiresAt,
                deviceContext: { user_agent: userAgent },
              },
              queryOptions,
            ),
          useClient,
        )
        const { queries } = await withCapturedTestQueries(() =>
          registerAuthenticatedSession({
            sid: sessionId,
            uid: user.id,
            did: v7(),
            expiresAt,
            deviceContext: { user_agent: userAgent },
          }),
        )
        // The query path rolled back its new row; the client-only path used its own transaction.
        expect(countCapturedQueriesByAnnotation(queries, 'upsertUserAgentString')).toBe(
          useClient ? 1 : 3,
        )
      })

      const directSession = await getTestUserSessionById(directSessionId)
      expect(directSession?.user_agent ?? null).toBe(useClient ? userAgent : null)
      await expect(getTestUserSessionById(sessionId)).resolves.toMatchObject({
        id: sessionId,
        user_agent: userAgent,
      })
    }
  })
})
