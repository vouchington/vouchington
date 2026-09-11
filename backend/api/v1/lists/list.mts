import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateUUIDParam,
  parseJsonBody,
} from '../../response-helpers.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getListForWrite,
  updateList,
  softDeleteList,
  currentUserCanManageList,
  currentUserCanViewList,
  type ListVisibility,
} from '@services/lists'
import { assertNotSuspended } from '@services/users'

const VALID_VISIBILITIES = new Set<ListVisibility>(['private', 'unlisted', 'public'])

app
  .route('/api/v1/lists/:id')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/lists/:id')
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getListForWrite(listId)
    const currentUserId = currentUser?.id ?? null
    ctx.assert(list && currentUserCanViewList(currentUserId, list), 404, 'List not found')

    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject({ list }))
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/lists/:id')
    assertNotSuspended(currentUser)
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getListForWrite(listId)
    ctx.assert(list, 404, 'List not found')
    ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

    const body = await parseJsonBody<{
      name?: string
      description?: string | null
      visibility?: ListVisibility
    }>(ctx)
    ctx.assert(
      body == null || (typeof body === 'object' && !Array.isArray(body)),
      422,
      'Request body must be a JSON object',
    )
    if (body?.name !== undefined) {
      ctx.assert(
        typeof body.name === 'string' && body.name.length > 0,
        422,
        'name must be a non-empty string',
      )
      ctx.assert(body.name.length <= 255, 422, 'name must be 255 characters or less')
    }
    if (body?.description !== undefined) {
      ctx.assert(
        body.description === null || typeof body.description === 'string',
        422,
        'description must be a string or null',
      )
    }
    if (body?.visibility !== undefined) {
      ctx.assert(VALID_VISIBILITIES.has(body.visibility), 422, 'Invalid visibility value')
    }

    const updated = await updateList(currentUser.id, listId, body ?? {})
    ctx.json({ list: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/lists/:id')
    assertNotSuspended(currentUser)
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getListForWrite(listId)
    ctx.assert(list, 404, 'List not found')
    ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

    await softDeleteList(currentUser.id, listId)
    ctx.setStatus(204)
  })
