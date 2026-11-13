import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getCountries } from '@services/countries'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'

app.route('/api/v1/countries').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/countries')

  setAnonymousPublicCacheHeaders(ctx, currentUser)

  const countries = await getCountries()
  ctx.json({ results: countries })
})
