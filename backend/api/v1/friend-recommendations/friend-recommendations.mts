import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  getFriendRecommendations,
  type FriendRecommendationResult,
} from '@services/friend-recommendations'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { indexById } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

// GET /api/v1/my/friend-recommendations
app.route('/api/v1/my/friend-recommendations').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/friend-recommendations', parser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/friend-recommendations')

  const options = parseRuntimePagination(parser, ctx.query)
  const query = prepareQueryForValidation(ctx.query, parser.queryContract)
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/friend-recommendations', { query })
  const result = await getFriendRecommendations(currentUser, options)
  const userIds = result.results.map((r: FriendRecommendationResult) => r.id)

  const output = {
    results: result.results,
    page_info: result.page_info,
    users: getUserPublicByAnyCachedBatch(userIds).then(indexById),
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(apiResponse('GET:/api/v1/my/friend-recommendations', output)))
})
