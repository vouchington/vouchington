import type { Context } from '@jongleberry/api-server'
import { getRssFeedByIdCached } from '@services/entity-fetch'
import { refreshRssFeedAsCurrentUser } from '@services/rss-feeds'
import { currentUserCanRefreshRssFeed } from '@services/rss-feeds/authorization'
import { defineQueryContract, queryBoolean } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { parseBooleanish } from '@ts-shared/utils/query'
import app from '../../app.mts'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiQuery, apiRequestContract } from '../../response-contract.mts'

const refreshRssFeedQueryContract = defineQueryContract({ force: queryBoolean() })

app.route('/api/v1/rss-feeds/:id/refreshes').post(async (ctx: Context) => {
  apiRequestContract<'POST:/api/v1/rss-feeds/:id/refreshes', { force?: boolean }>(
    'POST:/api/v1/rss-feeds/:id/refreshes',
  )
  apiQuery('POST:/api/v1/rss-feeds/:id/refreshes', refreshRssFeedQueryContract)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanRefreshRssFeed,
    'POST:/api/v1/rss-feeds/:id/refreshes',
  )
  const rssFeed = await getRssFeedByIdCached(validateUUIDParam(ctx, 'id'))
  ctx.assert(rssFeed, 404, 'RSS feed not found')

  const query = prepareQueryForValidation(ctx.query, refreshRssFeedQueryContract.queryContract)
  if (ctx.query.force !== undefined) query.force = normalizeRefreshForce(ctx.query.force)
  validateRequestContract(ctx, 'POST:/api/v1/rss-feeds/:id/refreshes', { path: ctx.params, query })

  let force = query.force === true
  if (ctx.query.force === undefined && ctx.request.is('json')) {
    const body = (await ctx.request.json('1mb')) as { force?: unknown }
    if (body && typeof body === 'object' && !Array.isArray(body) && body.force !== undefined) {
      body.force = normalizeRefreshForce(body.force)
    }
    validateRequestContract(ctx, 'POST:/api/v1/rss-feeds/:id/refreshes', { body })
    force = body.force === true
  }
  const refresh = await refreshRssFeedAsCurrentUser(currentUser, rssFeed.id, force)
  ctx.json({ success: true, message: 'RSS feed refresh enqueued', ...refresh })
})

function normalizeRefreshForce(value: unknown): unknown {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return parseBooleanish(value)
  if (typeof value === 'string' && /^(true|false|1|0)$/i.test(value)) {
    return parseBooleanish(value)
  }
  return value
}
