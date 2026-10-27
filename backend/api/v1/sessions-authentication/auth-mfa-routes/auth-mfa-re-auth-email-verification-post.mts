import type { Context } from '@jongleberry/api-server'
import { sanitizeEmailAddress } from '@services/email-address-validator'
import { getPrimaryEmailAddress } from '@services/my/email-addresses'
import { completeEmailReAuth } from '@services/users/email-reauth'
import { assertNotSuspended } from '@services/users/suspension'
import { assertEmailTokenVerificationAllowed } from '@services/users/email-auth-rate-limits'
import app from '../../../app.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/re-auth/email/verification').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/mfa/re-auth/email/verification')
  assertNotSuspended(currentUser)

  const body = (await parseJsonBody(ctx, '100kb')) as { code?: string }
  validateRequestContract(ctx, 'POST:/api/v1/auth/mfa/re-auth/email/verification', { body })
  ctx.assert(body.code, 422, 'code is required')

  // Verify against the user's own primary email — never a caller-supplied address.
  const [rawEmail, session] = await Promise.all([
    getPrimaryEmailAddress(currentUser.id),
    ctx.getSessionTokenData(),
  ])
  ctx.assert(rawEmail, 422, 'No email address associated with this account')

  const emailAddress = sanitizeEmailAddress(rawEmail)
  await assertEmailTokenVerificationAllowed({
    emailAddress,
    ip: ctx.ip,
    deviceId: session.did,
    sessionId: session.sid,
  })
  const token = await completeEmailReAuth(currentUser.id, session, emailAddress, body.code)
  ctx.json({ re_auth_token: token })
})
