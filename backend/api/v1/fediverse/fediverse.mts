import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import {
  FEDIVERSE_CURSOR_MAX_LENGTH,
  parseFediverseProviders,
  parseFediverseResultType,
} from '@services/fediverse-search'
import { clampAnonLimit, clampLimit } from '@modules/search-utils'
import { searchFediverse } from './search.mts'
import {
  defineQueryContract,
  queryCsvArray,
  queryEnum,
  queryInteger,
  queryString,
} from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'

const fediverseSearchQuery = defineQueryContract({
  q: queryString(),
  providers: queryCsvArray(queryEnum(['peertube', 'mastodon', 'lemmy', 'bluesky'] as const)),
  type: queryEnum(['video', 'post', 'profile', 'instance'] as const),
  limit: queryInteger({ minimum: 1, maximum: 25, default: 10 }),
  after: queryString(),
})

app.route('/api/v1/fediverse/search').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/fediverse/search', fediverseSearchQuery)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/fediverse/search')
  const qRaw = ctx.query.q
  ctx.assert(qRaw === undefined || typeof qRaw === 'string', 422, 'Invalid q')
  const q = qRaw ? qRaw.trim() : ''
  const providers = parseFediverseProviders(ctx.query.providers)
  const type = parseFediverseResultType(ctx.query.type)
  const parsedLimit = ctx.query.limit !== undefined ? Number(ctx.query.limit) : NaN
  const rawLimit = Number.isFinite(parsedLimit) ? parsedLimit : undefined
  const limit = currentUser ? clampLimit(rawLimit, 10) : clampAnonLimit(rawLimit ?? 10)
  ctx.assert(!Object.hasOwn(ctx.query, 'cursor'), 400, 'Use after instead of cursor')
  const afterRaw = ctx.query.after
  ctx.assert(afterRaw === undefined || typeof afterRaw === 'string', 422, 'Invalid after')
  const after = afterRaw ? afterRaw : undefined
  if (after !== undefined && after.length > FEDIVERSE_CURSOR_MAX_LENGTH)
    ctx.throw(400, 'Cursor is too long')

  const result = await searchFediverse({ q, providers, type, limit, cursor: after })

  if (!currentUser && result.buckets.every(bucket => bucket.status === 'ok')) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json(result)
})
