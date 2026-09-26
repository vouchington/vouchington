import type { Context } from '@jongleberry/api-server'
import { sanitizeEmailAddress } from '@services/email-address-validator'
import { createReAuthToken } from '@services/mfa'
import { getPrimaryEmailAddress } from '@services/my/email-addresses'
import { verifyEmailAddressLoginToken } from '@services/users/authentication'
import { assertNotSuspended } from '@services/users/suspension'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/re-auth/email/verification').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/mfa/re-auth/email/verification')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('100kb')) as { code?: string }
  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/re-auth/email/verification', { body })
  ctx.assert(body.code, 422, 'code is required')

  // Verify against the user's own primary email — never a caller-supplied address.
  const rawEmail = await getPrimaryEmailAddress(currentUser.id)
  ctx.assert(rawEmail, 422, 'No email address associated with this account')

  const emailAddress = sanitizeEmailAddress(rawEmail)
  const result = await verifyEmailAddressLoginToken(emailAddress, body.code)
  if (!result.success) ctx.throw(401, 'Invalid or expired verification code')

  const token = await createReAuthToken(currentUser.id)
  ctx.json({ re_auth_token: token })
})
