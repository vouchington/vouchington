import type { Context } from '@jongleberry/api-server'
import { createReAuthToken } from '@services/mfa'
import { verifyTotpCode } from '@services/totp'
import { assertNotSuspended } from '@services/users/suspension'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/re-auth/totp/verification').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/mfa/re-auth/totp/verification')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('100kb')) as { code?: string }
  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/re-auth/totp/verification', { body })
  ctx.assert(body.code, 422, 'code is required')

  const valid = await verifyTotpCode(currentUser.id, body.code)
  ctx.assert(valid, 401, 'Invalid verification code')

  const token = await createReAuthToken(currentUser.id)
  ctx.json({ re_auth_token: token })
})
