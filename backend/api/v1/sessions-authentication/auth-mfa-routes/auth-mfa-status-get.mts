import type { Context } from '@jongleberry/api-server'
import { getUserMfaStatus } from '@services/mfa'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/auth/mfa/status').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/auth/mfa/status')

  const status = await getUserMfaStatus(currentUser.id)
  ctx.json({
    has_mfa: status.hasMfa,
    passkeys_count: status.passkeysCount,
    totp_count: status.totpCount,
  })
})
