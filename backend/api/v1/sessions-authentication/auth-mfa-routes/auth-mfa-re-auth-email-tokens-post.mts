import type { Context } from '@jongleberry/api-server'
import { sanitizeEmailAddress } from '@services/email-address-validator'
import { getPrimaryEmailAddress } from '@services/my/email-addresses'
import {
  createEmailAddressLoginToken,
  enqueueEmailAddressLoginToken,
} from '@services/users/authentication'
import { assertNotSuspended } from '@services/users/suspension'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/re-auth/email/tokens').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/mfa/re-auth/email/tokens')
  assertNotSuspended(currentUser)

  // Always send to the user's own registered primary email — never an arbitrary address.
  const rawEmail = await getPrimaryEmailAddress(currentUser.id)
  ctx.assert(rawEmail, 422, 'No email address associated with this account')

  const emailAddress = sanitizeEmailAddress(rawEmail)
  const result = await createEmailAddressLoginToken(emailAddress)
  enqueueEmailAddressLoginToken(result.emailAddress, result.token, currentUser.ui_locale)
  ctx.json({ email_address: result.emailAddress })
})
