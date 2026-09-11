import app from '../../app.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { searchWeb, type WebSearchResult } from '@services/web-search'
import { toPublicViewHostname } from '@services/urls-hostnames'
import { EMPTY_PAGE_INFO, getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { clampAnonLimit, clampLimit, DEFAULT_LIMIT } from '@modules/search-utils'

app.route('/api/v1/web-search').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/web-search')

  const query = ctx.query.query ? String(ctx.query.query).trim() : ''

  if (query.length < 3) {
    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }
    ctx.json({ results: [], page_info: EMPTY_PAGE_INFO })
    return
  }

  const parsedLimit = ctx.query.limit !== undefined ? Number(ctx.query.limit) : NaN
  const rawLimit = !isNaN(parsedLimit) ? parsedLimit : DEFAULT_LIMIT
  const limit = currentUser ? clampLimit(rawLimit, DEFAULT_LIMIT) : clampAnonLimit(rawLimit)

  const { results, page_info } = await searchWeb({ query, limit })

  const publicResults = results.map((r: WebSearchResult) => ({
    ...r,
    url: {
      ...r.url,
      hostname: r.url.hostname ? toPublicViewHostname(r.url.hostname) : null,
    },
  }))

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json({ results: publicResults, page_info })
})
