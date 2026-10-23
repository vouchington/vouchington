import type { Context } from '@jongleberry/api-server'
import { peekLoginAttempt, countMfaLoginAttempt } from '@services/mfa'
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
  const loginAttemptId =
    typeof body.login_attempt_id === 'string' ? body.login_attempt_id : undefined
  ctx.assert(loginAttemptId, 422, 'login_attempt_id is required')
  ctx.assert(body.code, 422, 'code is required')
  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/totp/verification', { body })

  const attempt = await peekLoginAttempt(loginAttemptId)
  ctx.assert(attempt, 401, 'Login attempt expired or invalid')
  const alreadyLimited = await countMfaLoginAttempt(loginAttemptId, attempt)
  if (alreadyLimited) ctx.throw(429, 'Too many invalid verification codes. Please try again later.')

  const valid = await verifyTotpCode(attempt.userId, body.code)
  ctx.assert(valid, 401, 'Invalid verification code')

  ctx.json(await completeMfaVerification(ctx, loginAttemptId))
})
