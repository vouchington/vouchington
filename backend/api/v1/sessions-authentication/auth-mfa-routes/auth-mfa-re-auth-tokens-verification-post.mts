import type { Context } from '@jongleberry/api-server'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { MFA_REAUTH_REQUIRED } from '@modules/on-error/error-codes'
import { verifyAndDeleteReAuthToken } from '@services/mfa'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/re-auth/tokens/verification').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/mfa/re-auth/tokens/verification')

  const body = (await ctx.request.json('100kb')) as { re_auth_token?: string }
  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/re-auth/tokens/verification', { body })
  if (!body.re_auth_token)
    throw createCodedError(422, 'Re-authentication required', MFA_REAUTH_REQUIRED)

  const valid = await verifyAndDeleteReAuthToken(currentUser.id, body.re_auth_token)
  ctx.assert(valid, 401, 'Re-authentication token expired or invalid')

  ctx.setStatus(204)
})
