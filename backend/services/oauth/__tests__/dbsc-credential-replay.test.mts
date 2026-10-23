import { isDbscRegistrationEligible } from '@services/jwt-session/dbsc-eligibility'
import { describe, expect, it } from 'vitest'
import { createDbscTestSession } from '@voucha/test-helpers/dbsc-session'
import { addVerifiedEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import { getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { readSessionDeviceAuthority } from '@services/jwt-session/device-authority'
import { refreshSessionState } from '@services/jwt-session'
import { createOAuthFlowResultForUser } from '../oauth-flow-result.mts'

describe('OAuth replay after browser key registration', () => {
  it('returns the current device credential without resetting durable browser binding', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    const before = await readSessionDeviceAuthority(registered.sid)
    const emailAddress = `tests+dbsc-replay-${fixture.user.id}@voucha.ai`
    await addVerifiedEmailForUser(fixture.user.id, emailAddress)
    const user = await getTestPrivateUserById(fixture.user.id)
    expect(user).not.toBeNull()
    const replay = await createOAuthFlowResultForUser({
      user: user!,
      firstFactor: { type: 'email', emailAddress },
      sessionId: registered.sid,
      deviceId: registered.did,
      authenticatedSessionId: registered.sid,
      refreshAuthenticatedSession: true,
      deviceContext: { user_agent: fixture.base.userAgent },
    })
    if (replay.mfaRequired) throw new Error('Expected the completed credential replay')
    expect(replay.deviceToken.token).toBe(registered.dt)
    expect(isDbscRegistrationEligible(replay.deviceToken)).toBe(false)
    expect(await readSessionDeviceAuthority(registered.sid)).toMatchObject({
      device_bound_session_binding: before!.device_bound_session_binding,
      device_token_issued_at: before!.device_token_issued_at,
      expires_at: before!.expires_at,
    })
    await expect(
      refreshSessionState({ ...fixture.base, deviceToken: replay.deviceToken.token }),
    ).rejects.toMatchObject({ code: 'DBSC_PROOF_REQUIRED' })
  })
})
