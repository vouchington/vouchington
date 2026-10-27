import type { Context } from '@jongleberry/api-server'
import { sanitizeEmailAddress } from '@services/email-address-validator'
import { getPrimaryEmailAddress } from '@services/my/email-addresses'
import { createAndEnqueueEmailAddressReAuthToken } from '@services/users/authentication'
import { assertNotSuspended } from '@services/users/suspension'
import { assertEmailTokenRequestAllowed } from '@services/users/email-auth-rate-limits'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/re-auth/email/tokens').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/mfa/re-auth/email/tokens')
  assertNotSuspended(currentUser)

  // Always send to the user's own registered primary email — never an arbitrary address.
  const [rawEmail, session] = await Promise.all([
    getPrimaryEmailAddress(currentUser.id),
    ctx.getSessionTokenData(),
  ])
  ctx.assert(rawEmail, 422, 'No email address associated with this account')

  const emailAddress = sanitizeEmailAddress(rawEmail)
  await assertEmailTokenRequestAllowed({
    emailAddress,
    ip: ctx.ip,
    deviceId: session.did,
    sessionId: session.sid,
  })
  const recipient = await createAndEnqueueEmailAddressReAuthToken(
    emailAddress,
    currentUser.ui_locale ?? null,
    { purpose: 're_auth', currentUserId: currentUser.id, session },
  )
  ctx.json({ email_address: recipient })
})
