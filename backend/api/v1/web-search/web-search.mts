import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import { clampAnonLimit, clampLimit } from '@services/pagination'
import app from '../../app.mts'
import { searchWeb, type WebSearchResult } from '@services/web-search'
import { toPublicViewHostname } from '@services/urls-hostnames'
import {
  EMPTY_PAGE_INFO,
  getOptionalAuthAndRateLimit,
  validateRequestContract,
} from '../../response-helpers.mts'
import { apiQuery } from '../../api-query-contract.mts'
import { defineQueryContract, queryInteger, queryString } from '@vouchington/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { DEFAULT_LIMIT } from '@modules/search-utils'

const webSearchQuery = defineQueryContract({
  query: queryString(),
  after: queryString({ description: 'Opaque cursor from page_info.end_cursor.' }),
  limit: queryInteger({ minimum: 1, maximum: 100, default: DEFAULT_LIMIT }),
})

app.route('/api/v1/web-search').get(async ctx => {
  apiQuery('GET:/api/v1/web-search', webSearchQuery)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/web-search')

  const query = ctx.query.query ? String(ctx.query.query).trim() : ''
  const validationQuery = prepareQueryForValidation(ctx.query, webSearchQuery.queryContract)
  validationQuery.query = query
  validateRequestContract(ctx, 'GET:/api/v1/web-search', { query: validationQuery })

  const parsedLimit = ctx.query.limit !== undefined ? Number(ctx.query.limit) : undefined
  const limit = Math.trunc(
    currentUser ? clampLimit(parsedLimit) : clampAnonLimit(clampLimit(parsedLimit)),
  )

  if (query.length < 3) {
    setAnonymousPublicCacheHeaders(ctx, currentUser)
    ctx.json({ results: [], page_info: EMPTY_PAGE_INFO })
    return
  }

  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  const { results, page_info } = await searchWeb({ query, limit, after })

  const publicResults = results.map((r: WebSearchResult) => ({
    ...r,
    url: {
      ...r.url,
      hostname: r.url.hostname ? toPublicViewHostname(r.url.hostname) : null,
    },
  }))

  setAnonymousPublicCacheHeaders(ctx, currentUser)

  ctx.json({ results: publicResults, page_info })
})
