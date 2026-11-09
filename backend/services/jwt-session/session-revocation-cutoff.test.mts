import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { getTestPrivateUserById } from '@voucha/test-helpers/entities/private-users'
import { getTestUserSessionById } from '@voucha/test-helpers/entities/user-sessions'
import {
  clearSessionRevokedCacheForTest,
  insertTestSessionAtUserRevocationCutoff,
  seedSessionRevocationCutoffOverflow,
} from '@voucha/test-helpers/session-revocation-cutoff'
import { createDeviceAndSessionTokens } from './create.mts'
import { refreshSessionState } from './flows.mts'
import { isSessionRevoked } from './revocation.mts'
import { sessionLimitsMaxValues } from './session-limits-config.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'
import { revokeOtherAuthenticatedSessions } from './user-session-revocation.mts'
import { mintNativeSessionMcpToken } from '../oauth-authorization-server/native-session-tokens.mts'
import { validateOAuthAccessToken } from '../oauth-authorization-server/access-tokens.mts'
import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'

const testUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36'

describe('durable user session revocation cutoff', () => {
  it('enforces the durable cutoff across session authorities', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const targetDid = v7()
    const targetTokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: targetDid,
      deviceClass: 'attested',
      deviceContext: { user_agent: testUserAgent },
      authOrigin: 'native',
    })
    const target = {
      ...targetTokens,
      session: { sid: targetTokens.sessionToken.payload.sid, did: targetDid },
    }
    const anonymous = await createDeviceAndSessionTokens({ did: v7() })
    const nativeToken = await mintNativeSessionMcpToken(user.id, {
      did: targetDid,
      sid: target.session.sid,
      clientApp: 'ios',
      attestationStatus: 'unattested',
    })
    await seedSessionRevocationCutoffOverflow(
      user.id,
      sessionLimitsMaxValues.active_sessions_per_user + 1,
    )

    await using query = await beginTransaction()
    await revokeOtherAuthenticatedSessions(user.id, actor.session.sid, { query })
    await query.commit()

    const equalCutoffSessionId = await insertTestSessionAtUserRevocationCutoff(user.id)
    await expect(readSessionDeviceAuthority(equalCutoffSessionId)).resolves.toBeNull()

    await clearSessionRevokedCacheForTest(target.session.sid)
    expect((await getTestUserSessionById(target.session.sid))?.revoked_at).toBeNull()
    await expect(
      isSessionRevoked(target.session.sid, {
        userId: user.id,
      }),
    ).resolves.toBe(true)
    await expect(readSessionDeviceAuthority(target.session.sid)).resolves.toBeNull()
    await expect(validateOAuthAccessToken(nativeToken.access_token, 'user')).resolves.toBeNull()
    await expect(
      mintNativeSessionMcpToken(user.id, {
        did: targetDid,
        sid: target.session.sid,
        clientApp: 'ios',
        attestationStatus: 'unattested',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      refreshSessionState({
        deviceToken: target.deviceToken.token,
        userAgent: testUserAgent,
        fetchUser: getTestPrivateUserById,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })

    await expect(
      refreshSessionState({
        deviceToken: actor.deviceToken.token,
        sessionToken: actor.sessionToken.token,
        userAgent: testUserAgent,
        fetchUser: getTestPrivateUserById,
      }),
    ).resolves.toMatchObject({ uid: user.id, sid: actor.session.sid })

    const authenticatedAfterCutoff = await createDeviceAndSessionTokens({
      did: anonymous.deviceToken.payload.did,
      sid: anonymous.sessionToken.payload.sid,
      uid: user.id,
    })
    expect(
      await isSessionRevoked(authenticatedAfterCutoff.sessionToken.payload.sid, {
        userId: user.id,
      }),
    ).toBe(false)
  })
})
