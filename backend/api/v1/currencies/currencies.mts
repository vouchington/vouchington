import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import app from '../../app.mts'
import { apiQuery } from '../../api-query-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import { listCurrencies } from '@services/currencies'

const currenciesParser = createPaginationParser({
  cursor: { type: 'name', paramName: 'after' },
  limit: { min: 1, max: 25, default: 25 },
})

app.route('/api/v1/currencies').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/currencies', currenciesParser)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/currencies')
  const page = parseAndValidatePaginatedRequest(ctx, 'GET:/api/v1/currencies', currenciesParser)
  setAnonymousPublicCacheHeaders(ctx, currentUser)
  ctx.json(await listCurrencies(page))
})
