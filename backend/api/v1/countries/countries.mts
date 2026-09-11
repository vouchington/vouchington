import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getCountries } from '@services/countries'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'

app.route('/api/v1/countries').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/countries')

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const countries = await getCountries()
  ctx.json({ results: countries })
})
