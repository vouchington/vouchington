import type { Context } from '@jongleberry/api-server'
import { getExpectedOrigin } from '@modules/api-utils'
import { peekLoginAttempt, countMfaLoginAttempt } from '@services/mfa'
import { verifyPasskeyAuthentication } from '@services/passkeys'
import app from '../../../app.mts'
import { parseJsonBody, validateRequestContract } from '../../../response-helpers.mts'
import { completeMfaVerification } from './complete-mfa-verification.mts'

app.route('/api/v1/auth/mfa/passkeys/authentication/verification').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/mfa/passkeys/authentication/verification')

  const body = (await parseJsonBody(ctx, '100kb')) as {
    login_attempt_id?: string
    response?: unknown
  }
  const loginAttemptId =
    typeof body.login_attempt_id === 'string' ? body.login_attempt_id : undefined
  ctx.assert(loginAttemptId, 422, 'login_attempt_id is required')
  ctx.assert(body.response, 422, 'response is required')
  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/passkeys/authentication/verification', {
    body,
  })

  const attempt = await peekLoginAttempt(loginAttemptId)
  ctx.assert(attempt, 401, 'Login attempt expired or invalid')
  const alreadyLimited = await countMfaLoginAttempt(loginAttemptId, attempt)
  if (alreadyLimited) ctx.throw(429, 'Too many invalid MFA attempts. Please try again later.')

  const expectedOrigin = getExpectedOrigin(ctx.req)
  const verification = await verifyPasskeyAuthentication(
    attempt.userId,
    attempt.deviceId,
    expectedOrigin,
    body.response,
  )
  ctx.assert(verification.verified, 401, 'Passkey verification failed')

  ctx.json(
    await completeMfaVerification(ctx, loginAttemptId, {
      type: 'passkey',
      passkeyId: verification.passkeyId,
      verifiedAt: Math.floor(Date.now() / 1000),
    }),
  )
})
