import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getTopicByAnyCached } from '@services/entity-fetch'
import { getTopicByAny } from '@services/topics'
import {
  getAdditionalHostnames,
  addAdditionalHostname,
  removeAdditionalHostname,
} from '@services/topics/additional-hostnames'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'
import { isUUID } from '@modules/utils'

const additionalHostnamesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})
type CreateAdditionalHostnameBody = { hostname: string }

app
  .route('/api/v1/topics/:idOrSlug/additional-hostnames')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/topics/:idOrSlug/additional-hostnames', additionalHostnamesParser)
    await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'GET:/api/v1/topics/:idOrSlug/additional-hostnames',
    )
    const options = additionalHostnamesParser.parse(ctx.query)
    const query = prepareQueryForValidation(ctx.query, additionalHostnamesParser.queryContract)
    if (ctx.query.limit !== undefined) query.limit = options.limit
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/additional-hostnames', {
      path: ctx.params,
      query,
    })

    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    ctx.assert(topic, 404, 'Topic not found')

    const scope = `additional-hostnames:${topic.id}:id-asc`
    const afterId = options.after
      ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
      : undefined
    const { results, hasNextPage } = await getAdditionalHostnames(topic.id, {
      limit: options.limit,
      after: afterId ? { id: afterId } : undefined,
    })
    ctx.json({
      results,
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: results[0] ? encodeScopedUuidCursor(results[0].hostname_id, scope) : null,
        end_cursor:
          hasNextPage && results.at(-1)
            ? encodeScopedUuidCursor(results.at(-1)!.hostname_id, scope)
            : null,
      },
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'POST:/api/v1/topics/:idOrSlug/additional-hostnames',
    )
    validateRequestContract(ctx, 'POST:/api/v1/topics/:idOrSlug/additional-hostnames', {
      path: ctx.params,
    })

    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    ctx.assert(topic, 404, 'Topic not found')

    const body = (await ctx.request.json('1mb')) as CreateAdditionalHostnameBody
    validateRequestContract(ctx, 'POST:/api/v1/topics/:idOrSlug/additional-hostnames', {
      body,
    })
    ctx.assert(
      typeof body.hostname === 'string' && body.hostname.trim(),
      400,
      'hostname is required',
    )

    const result = await addAdditionalHostname(topic.id, body.hostname.trim(), currentUser.id)
    ctx.setStatus(201)
    ctx.json({ additional_hostname: result })
  })

app
  .route('/api/v1/topics/:idOrSlug/additional-hostnames/:hostnameId')
  .delete(async (ctx: Context) => {
    await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'DELETE:/api/v1/topics/:idOrSlug/additional-hostnames/:hostnameId',
    )
    validateRequestContract(
      ctx,
      'DELETE:/api/v1/topics/:idOrSlug/additional-hostnames/:hostnameId',
      {
        path: ctx.params,
      },
    )

    ctx.assert(isUUID(ctx.params.hostnameId!), 422, 'hostnameId must be a valid UUID')

    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    ctx.assert(topic, 404, 'Topic not found')

    await removeAdditionalHostname(topic.id, ctx.params.hostnameId!)
    ctx.setStatus(204)
  })
