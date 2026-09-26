import type { Context } from '@jongleberry/api-server'
import { getExpectedOrigin } from '@modules/api-utils'
import {
  isMfaLoginAttemptLimited,
  peekLoginAttempt,
  recordFailedMfaLoginAttempt,
} from '@services/mfa'
import { verifyPasskeyAuthentication } from '@services/passkeys'
import app from '../../../app.mts'
import { validateRequestContract } from '../../../response-helpers.mts'
import { completeMfaVerification } from './complete-mfa-verification.mts'

app.route('/api/v1/auth/mfa/passkeys/authentication/verification').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/mfa/passkeys/authentication/verification')

  const body = (await ctx.request.json('100kb')) as {
    login_attempt_id?: string
    response?: unknown
  }
  // Type-guarded before the attempt-limit counter below so a wrong-typed id still counts against
  // it instead of reaching the lookup with a non-string key.
  const loginAttemptId =
    typeof body.login_attempt_id === 'string' ? body.login_attempt_id : undefined
  ctx.assert(loginAttemptId, 422, 'login_attempt_id is required')
  ctx.assert(body.response, 422, 'response is required')

  const attempt = await peekLoginAttempt(loginAttemptId)
  ctx.assert(attempt, 401, 'Login attempt expired or invalid')
  const alreadyLimited = await isMfaLoginAttemptLimited(loginAttemptId, attempt)
  if (alreadyLimited) ctx.throw(429, 'Too many invalid MFA attempts. Please try again later.')

  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/passkeys/authentication/verification', {
    body,
  })

  const expectedOrigin = getExpectedOrigin(ctx.req)
  const verification = await verifyPasskeyAuthentication(
    attempt.userId,
    attempt.deviceId,
    expectedOrigin,
    body.response,
  )
  if (!verification.verified) {
    const limited = await recordFailedMfaLoginAttempt(loginAttemptId, attempt)
    if (limited) ctx.throw(429, 'Too many invalid MFA attempts. Please try again later.')
  }
  ctx.assert(verification.verified, 401, 'Passkey verification failed')

  ctx.json(await completeMfaVerification(ctx, loginAttemptId))
})
