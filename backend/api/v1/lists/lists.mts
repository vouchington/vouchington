import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { defineQueryContract, queryInteger, queryString } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createOwnedList, searchUserLists, type ListVisibility } from '@services/lists'
import { assertNotSuspended } from '@services/users'

type CreateListBody = {
  name: string
  description?: string | null
  visibility?: ListVisibility
}

const listsQuery = defineQueryContract({
  after: queryString(),
  limit: queryInteger({ minimum: 1, maximum: 100 }),
})

app
  .route('/api/v1/lists')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/lists', listsQuery)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/lists')

    const query = prepareQueryForValidation(ctx.query, listsQuery.queryContract)
    validateRequestContract(ctx, 'GET:/api/v1/lists', { query })
    const { limit, after } = query as { limit?: number; after?: string }

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

    const body = (await ctx.request.json('1mb')) as CreateListBody
    validateRequestContract(ctx, 'POST:/api/v1/lists', { body })

    const list = await createOwnedList(currentUser.id, provenance, body)

    ctx.setStatus(201)
    ctx.json({ list })
  })
