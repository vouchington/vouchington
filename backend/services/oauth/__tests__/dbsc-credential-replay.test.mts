import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { revokeSession, getEnrichedSessionClaims } from '@services/jwt-session'
import { getWebSessionAuthorityKey } from '@services/jwt-session/dbsc-state'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { issuePreparedOAuthFlowResult } from '../oauth-flow-result.mts'

const origin = 'https://dbsc.example'
const userAgent = 'Synthetic browser/1.0'

async function preparedLogin(native: boolean) {
  const user = await createTestUserDirect()
  const options = {
    user,
    claims: await getEnrichedSessionClaims(user),
    deviceId: v7(),
    deviceContext: { user_agent: userAgent, origin, isNativeClient: native },
  }
  const result = await issuePreparedOAuthFlowResult(options)
  return { options, result }
}

describe('OAuth credential replay preserves session client authority', () => {
  it('preserves a web session when new OAuth replay headers claim native', async () => {
    const { options, result } = await preparedLogin(false)
    const replay = await issuePreparedOAuthFlowResult({
      ...options,
      authenticatedSessionId: result.sessionToken.payload.sid,
      refreshAuthenticatedSession: true,
      deviceContext: { user_agent: userAgent, origin, isNativeClient: true },
    })
    expect(replay.sessionToken.payload.client).toBe('web')
    expect(replay.sessionToken.payload.dbsc).toBeUndefined()
    expect(replay.deviceToken.registrationEligible).toBe(false)
    expect(replay.deviceToken.payload.client).toBe('web')
  })

  it('preserves native identity without adding user-agent or origin checks on replay', async () => {
    const { options, result } = await preparedLogin(true)
    const replay = await issuePreparedOAuthFlowResult({
      ...options,
      authenticatedSessionId: result.sessionToken.payload.sid,
      refreshAuthenticatedSession: true,
      deviceContext: {
        user_agent: 'Another native agent',
        origin: 'https://other.example',
        isNativeClient: false,
      },
    })
    expect(replay.sessionToken.payload.client).toBe('native')
    expect(replay.sessionToken.payload).not.toHaveProperty('ua_hash')
    expect(replay.deviceToken).not.toHaveProperty('registrationEligible')
    expect(replay.deviceToken.token).toBe(result.deviceToken.token)
  })

  it.each([false, true])(
    'does not recreate lost authority from changed client headers (native: %s)',
    async native => {
      const { options, result } = await preparedLogin(native)
      const sid = result.sessionToken.payload.sid
      await sessionValkeyClient.unlink([getWebSessionAuthorityKey(sid)])
      await expect(
        issuePreparedOAuthFlowResult({
          ...options,
          authenticatedSessionId: sid,
          refreshAuthenticatedSession: true,
          deviceContext: { user_agent: userAgent, origin, isNativeClient: !native },
        }),
      ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
      expect(await sessionValkeyClient.get(getWebSessionAuthorityKey(sid))).toBeNull()
    },
  )
  it('retains a revoked registry row as a mint receipt after authority loss', async () => {
    const { options, result } = await preparedLogin(false)
    const sid = result.sessionToken.payload.sid
    await revokeSession(sid)
    await sessionValkeyClient.unlink([getWebSessionAuthorityKey(sid)])
    await expect(
      issuePreparedOAuthFlowResult({
        ...options,
        authenticatedSessionId: sid,
        refreshAuthenticatedSession: true,
        deviceContext: { user_agent: userAgent, origin, isNativeClient: true },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    expect(await sessionValkeyClient.get(getWebSessionAuthorityKey(sid))).toBeNull()
  })
})
