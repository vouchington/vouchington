import type { Context } from '@jongleberry/api-server'
import { verifyTotpReAuth } from '@services/mfa/totp-reauth'
import { countTotpReAuthAttempt } from '@services/mfa/re-auth-failures'
import { assertNotSuspended } from '@services/users/suspension'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/re-auth/totp/verification').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/mfa/re-auth/totp/verification')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('100kb')) as { code?: string }
  ctx.assert(body.code, 422, 'code is required')
  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/re-auth/totp/verification', { body })

  await countTotpReAuthAttempt(currentUser.id)

  const token = await verifyTotpReAuth(currentUser.id, await ctx.getSessionTokenData(), body.code)
  ctx.json({ re_auth_token: token })
})
