import type { Context } from '@jongleberry/api-server'
import { peekLoginAttempt } from '@services/mfa'
import { getPasskeyAuthenticationOptions } from '@services/passkeys'
import app from '../../../app.mts'

app.route('/api/v1/auth/mfa/passkeys/authentication/options').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/mfa/passkeys/authentication/options')

  const body = (await ctx.request.json('100kb')) as { login_attempt_id?: string }
  ctx.assert(body.login_attempt_id, 422, 'login_attempt_id is required')

  const attempt = await peekLoginAttempt(body.login_attempt_id)
  ctx.assert(attempt, 401, 'Login attempt expired or invalid')

  const options = await getPasskeyAuthenticationOptions(attempt.userId, attempt.deviceId)
  ctx.json({ options })
})
