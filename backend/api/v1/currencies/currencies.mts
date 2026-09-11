import app from '../../app.mts'
import { apiQuery } from '../../response-contract.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { listCurrencies } from '@services/currencies'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

const currenciesParser = createPaginationParser({
  cursor: { type: 'name', paramName: 'after' },
  limit: { min: 1, max: 25, default: 25 },
})

app.route('/api/v1/currencies').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/currencies', currenciesParser)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/currencies')
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }
  ctx.json(await listCurrencies(currenciesParser.parse(ctx.query)))
})
