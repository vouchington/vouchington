import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { isAdminUser } from '@services/users/authorization'
import { isUUID } from '@modules/utils'
import {
  type CuratedAsideType,
  listCuratedItems,
  createCuratedItem,
  deleteCuratedItem,
  reorderCuratedItems,
} from '@services/curated-aside-items'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

const ALLOWED_ASIDE_TYPES = ['topic', 'source', 'community'] as const

// GET /api/v1/curated-aside-items?type=topic
app.route('/api/v1/curated-aside-items').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/curated-aside-items')

  const asideType = ctx.query.type as string | undefined
  ctx.assert(typeof asideType === 'string' && asideType.trim().length > 0, 400, 'type is required')
  const safeAsideType = asideType.trim() as CuratedAsideType
  ctx.assert(
    (ALLOWED_ASIDE_TYPES as readonly string[]).includes(safeAsideType),
    422,
    'type must be one of: topic, source, community',
  )

  const items = await listCuratedItems(safeAsideType)

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json({ curated_aside_items: items })
})

app.route('/api/v1/curated-aside-items').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'POST:/api/v1/curated-aside-items',
  )

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(
    typeof body.aside_type === 'string' && body.aside_type.trim().length > 0,
    400,
    'aside_type is required',
  )
  ctx.assert(
    (ALLOWED_ASIDE_TYPES as readonly string[]).includes((body.aside_type as string).trim()),
    422,
    'aside_type must be one of: topic, source, community',
  )
  ctx.assert(
    typeof body.entity_id === 'string' && body.entity_id.trim().length > 0,
    400,
    'entity_id is required',
  )
  ctx.assert(isUUID(body.entity_id as string), 422, 'entity_id must be a valid UUID')
  const position = body.position
  ctx.assert(
    position === undefined || (typeof position === 'number' && Number.isInteger(position)),
    422,
    'position must be an integer',
  )
  ctx.assert(
    position === undefined || (position >= 0 && position <= 32767),
    422,
    'position must be between 0 and 32767',
  )

  const item = await createCuratedItem(
    currentUser,
    (body.aside_type as string).trim() as CuratedAsideType,
    (body.entity_id as string).trim(),
    position,
  )

  ctx.setStatus(201)
  ctx.json({ curated_aside_item: item })
})

app.route('/api/v1/curated-aside-items/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'DELETE:/api/v1/curated-aside-items/:id',
  )

  const id = validateUUIDParam(ctx, 'id')
  await deleteCuratedItem(currentUser, id)
  ctx.setStatus(204)
})

app.route('/api/v1/curated-aside-items/order').put(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'PUT:/api/v1/curated-aside-items/order',
  )

  const body = (await ctx.request.json('50kb')) as Record<string, unknown>
  ctx.assert(
    typeof body.aside_type === 'string' && body.aside_type.trim().length > 0,
    400,
    'aside_type is required',
  )
  ctx.assert(
    (ALLOWED_ASIDE_TYPES as readonly string[]).includes((body.aside_type as string).trim()),
    422,
    'aside_type must be one of: topic, source, community',
  )
  ctx.assert(
    Array.isArray(body.item_ids) && body.item_ids.every((id: unknown) => typeof id === 'string'),
    400,
    'item_ids must be an array of strings',
  )
  ctx.assert(
    (body.item_ids as string[]).every(id => isUUID(id)),
    422,
    'item_ids must all be valid UUIDs',
  )
  ctx.assert(
    new Set(body.item_ids as string[]).size === (body.item_ids as string[]).length,
    422,
    'item_ids must not contain duplicates',
  )

  await reorderCuratedItems(
    currentUser,
    (body.aside_type as string).trim(),
    body.item_ids as string[],
  )
  ctx.setStatus(204)
})
