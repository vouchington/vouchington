import type { Context } from '@jongleberry/api-server'
import app from '../app.mts'
import { unsubscribeEmailToken } from '@services/users'
import { UNSUBSCRIBE_MEDIA_TYPES } from './unsubscribe-media-types.mts'

app.route('/api/v1/email-unsubscribe').post(
  async (ctx: Context) => {
    await ctx.applyRouteRateLimit('POST:/api/v1/email-unsubscribe')
    const body = (await ctx.request.json('10kb').catch(() => ({}))) as { token?: unknown }
    const token =
      typeof body.token === 'string'
        ? body.token
        : typeof ctx.query.token === 'string'
          ? ctx.query.token
          : ''
    await unsubscribeEmailToken(token)
    ctx.json({ ok: true })
  },
  { acceptedMediaTypes: UNSUBSCRIBE_MEDIA_TYPES },
)
