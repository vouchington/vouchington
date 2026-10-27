import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  createTestUserDirect,
  getTestPrivateUserById,
  addTestUserRole,
  insertTestTotpAuthenticator,
  hardDeleteTestUser,
} from '@voucha/test-helpers'
import { expireTestSessionAuthority } from '@voucha/test-helpers/entities/session-assurance'
import { createDeviceAndSessionTokens, revokeAuthenticatedSession } from '@services/jwt-session'
import { createOAuthFlowResultForUser } from './oauth-flow-result.mts'

const deviceContext = { user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' }

describe('completed OAuth issuance preserves original assurance', () => {
  it('serializes the first issuer and a concurrent receipt replay onto the exact same durable credential', async () => {
    const user = await createTestUserDirect({ withEmail: true })
    const deviceId = v7()
    const authenticatedSessionId = v7()
    const options = {
      user,
      firstFactor: { type: 'email' as const, emailAddress: user.email_address! },
      deviceId,
      authenticatedSessionId,
      sessionId: v7(),
      deviceContext,
    }
    const results = await Promise.all([
      createOAuthFlowResultForUser(options),
      createOAuthFlowResultForUser({ ...options, refreshAuthenticatedSession: true }),
    ])
    const [first, replay] = results
    if (first.mfaRequired || replay.mfaRequired)
      throw new Error('Expected completed credential issuance')
    expect(first.sessionToken.payload.sid).toBe(authenticatedSessionId)
    expect(replay.sessionToken.payload.sid).toBe(authenticatedSessionId)
    expect(replay.deviceToken.token).toBe(first.deviceToken.token)
    expect(first.user.roles).toEqual(first.sessionToken.payload.rol ?? [])
    expect(replay.user.roles).toEqual(replay.sessionToken.payload.rol ?? [])
    expect(replay.sessionToken.payload.mfa_at).toBeUndefined()
  })

  it.each([false, true])(
    'replays original proof and response authority after enrollment/role change (proof=%s)',
    async proof => {
      const user = await createTestUserDirect({ withEmail: true })
      const verifiedAt = proof ? Math.floor(Date.now() / 1000) - 60 : undefined
      const initial = await createDeviceAndSessionTokens({
        uid: user.id,
        did: v7(),
        mfaVerifiedAt: verifiedAt,
        deviceContext,
      })
      await insertTestTotpAuthenticator(user.id, 'later-enrollment')
      await addTestUserRole(user.id, 'administrator')
      const currentUser = await getTestPrivateUserById(user.id)
      if (!currentUser) throw new Error('Expected the current test account')
      const replay = await createOAuthFlowResultForUser({
        user: currentUser,
        firstFactor: { type: 'email', emailAddress: user.email_address! },
        deviceId: initial.deviceToken.payload.did,
        sessionId: v7(),
        authenticatedSessionId: initial.sessionToken.payload.sid,
        deviceContext,
      })
      if (replay.mfaRequired) throw new Error('A completed receipt cannot become a new MFA attempt')
      expect(replay.deviceToken.token).toBe(initial.deviceToken.token)
      expect(replay.sessionToken.payload.mfa_at).toBe(verifiedAt)
      expect(replay.sessionToken.payload.rol?.includes('administrator')).toBe(proof)
      expect(replay.user.roles.includes('administrator')).toBe(proof)
      expect(replay.user.roles).toEqual(replay.sessionToken.payload.rol ?? [])
    },
  )

  it.each([
    { status: 'revoked', error: { status: 401, code: 'SESSION_RELOGIN_REQUIRED' } },
    { status: 'expired', error: { status: 401, code: 'SESSION_RELOGIN_REQUIRED' } },
    { status: 'deleted', error: { code: 'P0002' } },
  ])(
    'rejects $status completed authority instead of issuing another MFA attempt',
    async ({ status, error }) => {
      const user = await createTestUserDirect({ withEmail: true })
      const initial = await createDeviceAndSessionTokens({ uid: user.id, did: v7(), deviceContext })
      await insertTestTotpAuthenticator(user.id, 'must-not-restart-login')
      if (status === 'revoked')
        await revokeAuthenticatedSession(user.id, initial.sessionToken.payload.sid)
      else if (status === 'expired')
        await expireTestSessionAuthority(initial.sessionToken.payload.sid)
      else await hardDeleteTestUser(user.id)
      await expect(
        createOAuthFlowResultForUser({
          user,
          firstFactor: { type: 'email', emailAddress: user.email_address! },
          deviceId: initial.deviceToken.payload.did,
          sessionId: v7(),
          authenticatedSessionId: initial.sessionToken.payload.sid,
          deviceContext,
        }),
      ).rejects.toMatchObject(error)
    },
  )
})
