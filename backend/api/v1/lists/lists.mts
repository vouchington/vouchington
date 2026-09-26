import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody } from '../../response-helpers.mts'
import { createList, searchUserLists, type ListVisibility } from '@services/lists'
import { assertNotSuspended } from '@services/users'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

const VALID_VISIBILITIES = new Set<ListVisibility>(['private', 'unlisted', 'public'])

app
  .route('/api/v1/lists')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/lists')

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined

    const result = await searchUserLists(currentUser.id, { limit, after })

    ctx.setType('json')
    await ctx.pipeline(
      streamJsonObject({
        results: result.results.map(l => ({ __entity_type: 'list' as const, id: l.id })),
        page_info: result.page_info,
        lists: Object.fromEntries(result.results.map(l => [l.id, l])),
      }),
    )
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/lists')
    const provenance = getRequestContentProvenance()
    assertNotSuspended(currentUser)

    const body = await parseJsonBody<{
      name: string
      description?: string
      visibility?: ListVisibility
    }>(ctx)
    ctx.assert(
      typeof body?.name === 'string' && body.name.length > 0,
      422,
      'name must be a non-empty string',
    )
    ctx.assert(body.name.length <= 255, 422, 'name must be 255 characters or less')
    ctx.assert(
      body?.description === undefined ||
        body.description === null ||
        typeof body.description === 'string',
      422,
      'description must be a string or null',
    )
    if (body?.visibility !== undefined) {
      ctx.assert(VALID_VISIBILITIES.has(body.visibility), 422, 'Invalid visibility value')
    }

    const list = await createList(provenance, currentUser.id, {
      name: body!.name,
      description: body?.description ?? null,
      visibility: body?.visibility ?? 'private',
    })

    ctx.setStatus(201)
    ctx.json({ list })
  })
