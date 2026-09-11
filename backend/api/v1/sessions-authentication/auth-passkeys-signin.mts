import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getExpectedOrigin, setAuthenticationCookies } from '@modules/api-utils'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import {
  getDiscoverablePasskeyAuthenticationOptions,
  verifyDiscoverablePasskeyAuthentication,
} from '@services/passkeys'
import { getPrivateUserByAny } from '@services/users/get'
import { getDeviceContext } from './device-context.mts'

// ─── Discoverable passkey sign-in (no auth required) ─────────────────────────
//
// These endpoints allow a user to sign in with a passkey without first providing
// their email address. The credential is resolved from the assertion response and
// must match an existing account; unrecognised credentials return 401 and never
// create a new user (sign-in only, not sign-up).

app.route('/api/v1/auth/passkeys/authentication/options').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/passkeys/authentication/options')
  const sessionData = await ctx.getSessionTokenData()
  let deviceId = sessionData.did
  if (!sessionData.uid) {
    const deviceClass = 'dc' in sessionData ? sessionData.dc : undefined
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
      did: sessionData.did,
      sid: sessionData.sid,
      uid: null,
      deviceClass,
    })
    setAuthenticationCookies(ctx, {
      dt: deviceToken.token,
      st: sessionToken.token,
      deviceClass: deviceToken.payload.dc,
    })
    deviceId = deviceToken.payload.did
  }
  const options = await getDiscoverablePasskeyAuthenticationOptions(deviceId)
  ctx.json({ options })
})

app.route('/api/v1/auth/passkeys/authentication/verify').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/passkeys/authentication/verify')

  const body = (await ctx.request.json('100kb')) as { response?: unknown }
  ctx.assert(body.response, 422, 'response is required')

  const sessionData = await ctx.getSessionTokenData()
  const expectedOrigin = getExpectedOrigin(ctx.req)
  const deviceClass = 'dc' in sessionData ? sessionData.dc : undefined

  const login = await verifyDiscoverablePasskeyAuthentication({
    deviceId: sessionData.did,
    sessionId: sessionData.sid,
    expectedOrigin,
    response: body.response,
    deviceClass,
    deviceContext: getDeviceContext(ctx),
    fetchUser: getPrivateUserByAny,
  })

  /* v8 ignore start — success path requires a real WebAuthn ceremony (covered by Playwright) */
  setAuthenticationCookies(ctx, {
    dt: login.deviceToken.token,
    st: login.sessionToken.token,
    deviceClass: login.deviceToken.payload.dc,
  })

  ctx.json({
    user: { id: login.userId },
    dt: login.deviceToken,
    st: login.sessionToken,
    session: login.sessionToken.payload,
  })
  /* v8 ignore stop */
})
