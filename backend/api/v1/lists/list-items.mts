import { clampAnonLimit, getPaginationLimits } from '@services/pagination'
import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { defineQueryContract, queryBoolean, queryInteger, queryString } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

import { getListForWrite, searchListItems, currentUserCanViewList } from '@services/lists'

const listItemsQuery = defineQueryContract({
  after: queryString(),
  limit: queryInteger({ minimum: 1, maximum: 100 }),
  media_type: queryString(),
  read: queryBoolean(),
})

app.route('/api/v1/lists/:id/items').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/lists/:id/items', listItemsQuery)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/lists/:id/items')
  const query = prepareQueryForValidation(ctx.query, listItemsQuery.queryContract)
  validateRequestContract(ctx, 'GET:/api/v1/lists/:id/items', { path: ctx.params, query })
  const listId = validateUUIDParam(ctx, 'id')
  const list = await getListForWrite(listId)
  const currentUserId = currentUser?.id ?? null
  ctx.assert(list && currentUserCanViewList(currentUserId, list), 404, 'List not found')

  const {
    media_type: mediaType,
    after,
    read,
  } = query as {
    media_type?: string
    after?: string
    read?: boolean
  }
  const requestedLimit = query.limit as number | undefined
  const limit = currentUser
    ? requestedLimit
    : clampAnonLimit(requestedLimit ?? getPaginationLimits(20).default)

  const result = await searchListItems(listId, {
    mediaType,
    limit,
    after,
    ...(read !== undefined && currentUser ? { read, currentUserId: currentUser.id } : {}),
  })

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.setType('json')
  await ctx.pipeline(
    streamJsonObject({
      results: result.results.map(i => ({ __entity_type: 'list_item' as const, id: i.id })),
      page_info: result.page_info,
      list_items: Object.fromEntries(result.results.map(i => [i.id, i])),
    }),
  )
})
