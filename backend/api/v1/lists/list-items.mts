import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { clampAnonLimit } from '@modules/search-utils'
import { getListForWrite, searchListItems, currentUserCanViewList } from '@services/lists'

app.route('/api/v1/lists/:id/items').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/lists/:id/items')
  const listId = validateUUIDParam(ctx, 'id')
  const list = await getListForWrite(listId)
  const currentUserId = currentUser?.id ?? null
  ctx.assert(list && currentUserCanViewList(currentUserId, list), 404, 'List not found')

  const mediaType = ctx.query.media_type as string | undefined
  const limit = currentUser
    ? Number(ctx.query.limit) || undefined
    : clampAnonLimit(Number(ctx.query.limit) || 20)
  const after = ctx.query.after as string | undefined
  const readRaw = ctx.query.read as string | undefined
  const read = readRaw === 'true' ? true : readRaw === 'false' ? false : undefined

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
