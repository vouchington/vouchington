import app from '../../app.mts'
import { requireAuth } from '../../response-helpers.mts'
import { getAccountReAuthMethods } from '@services/mfa/reauth-methods'
import { getProviderReAuthMethods } from '@services/oauth/provider-reauth-methods'

app.route('/api/v1/auth/re-auth/methods').get(async ctx => {
  const user = await requireAuth(ctx, 'GET:/api/v1/auth/re-auth/methods')
  ctx.set('Cache-Control', 'no-store')
  const [methods, providers] = await Promise.all([
    getAccountReAuthMethods(user.id),
    getProviderReAuthMethods(user.id),
  ])
  ctx.json({ ...methods, providers })
})
