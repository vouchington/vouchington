import type { Context } from '@jongleberry/api-server'
import {
  isMfaLoginAttemptLimited,
  peekLoginAttempt,
  recordFailedMfaLoginAttempt,
} from '@services/mfa'
import { verifyTotpCode } from '@services/totp'
import app from '../../../app.mts'
import { validateRequestContract } from '../../../response-helpers.mts'
import { completeMfaVerification } from './complete-mfa-verification.mts'

app.route('/api/v1/auth/mfa/totp/verification').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/mfa/totp/verification')

  const body = (await ctx.request.json('100kb')) as {
    login_attempt_id?: string
    code?: string
  }
  // Type-guarded before the attempt-limit counter below so a wrong-typed id still counts against
  // it instead of reaching the lookup with a non-string key.
  const loginAttemptId =
    typeof body.login_attempt_id === 'string' ? body.login_attempt_id : undefined
  ctx.assert(loginAttemptId, 422, 'login_attempt_id is required')
  ctx.assert(body.code, 422, 'code is required')

  const attempt = await peekLoginAttempt(loginAttemptId)
  ctx.assert(attempt, 401, 'Login attempt expired or invalid')
  const alreadyLimited = await isMfaLoginAttemptLimited(loginAttemptId, attempt)
  if (alreadyLimited) ctx.throw(429, 'Too many invalid verification codes. Please try again later.')

  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/totp/verification', { body })

  const valid = await verifyTotpCode(attempt.userId, body.code)
  if (!valid) {
    const limited = await recordFailedMfaLoginAttempt(loginAttemptId, attempt)
    if (limited) ctx.throw(429, 'Too many invalid verification codes. Please try again later.')
  }
  ctx.assert(valid, 401, 'Invalid verification code')

  await completeMfaVerification(ctx, loginAttemptId)
})
