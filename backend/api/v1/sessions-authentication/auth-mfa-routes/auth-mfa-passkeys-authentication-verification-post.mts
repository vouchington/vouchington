import type { Context } from '@jongleberry/api-server'
import { getExpectedOrigin, setAuthenticationCookies } from '@modules/api-utils'
import {
  completeMfaLoginWithContext,
  getAndDeleteLoginAttempt,
  isMfaLoginAttemptLimited,
  peekLoginAttempt,
  recordFailedMfaLoginAttempt,
} from '@services/mfa'
import { verifyPasskeyAuthentication } from '@services/passkeys'
import { getPrivateUserByAny } from '@services/users/get'
import app from '../../../app.mts'
import { getDeviceContext } from '../device-context.mts'

app.route('/api/v1/auth/mfa/passkeys/authentication/verification').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/mfa/passkeys/authentication/verification')

  const body = (await ctx.request.json('100kb')) as {
    login_attempt_id?: string
    response?: unknown
  }
  ctx.assert(body.login_attempt_id, 422, 'login_attempt_id is required')
  ctx.assert(body.response, 422, 'response is required')

  const attempt = await peekLoginAttempt(body.login_attempt_id)
  ctx.assert(attempt, 401, 'Login attempt expired or invalid')
  const alreadyLimited = await isMfaLoginAttemptLimited(body.login_attempt_id, attempt)
  if (alreadyLimited) ctx.throw(429, 'Too many invalid MFA attempts. Please try again later.')

  const expectedOrigin = getExpectedOrigin(ctx.req)
  const verification = await verifyPasskeyAuthentication(
    attempt.userId,
    attempt.deviceId,
    expectedOrigin,
    body.response,
  )
  if (!verification.verified) {
    const limited = await recordFailedMfaLoginAttempt(body.login_attempt_id, attempt)
    if (limited) ctx.throw(429, 'Too many invalid MFA attempts. Please try again later.')
  }
  ctx.assert(verification.verified, 401, 'Passkey verification failed')

  // Consume only after successful verification so cancelled/failed assertions don't destroy the attempt
  const consumedAttempt = await getAndDeleteLoginAttempt(body.login_attempt_id)
  ctx.assert(consumedAttempt, 401, 'Login attempt expired or invalid')

  const user = await getPrivateUserByAny(consumedAttempt.userId)
  const login = await completeMfaLoginWithContext(consumedAttempt, user, getDeviceContext(ctx))
  setAuthenticationCookies(ctx, {
    dt: login.deviceToken.token,
    st: login.sessionToken.token,
    deviceClass: login.deviceClass,
  })
  ctx.json({
    user: { id: login.userId },
    dt: login.deviceToken,
    st: login.sessionToken,
    session: login.sessionToken.payload,
  })
})
