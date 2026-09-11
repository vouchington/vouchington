import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getTopicByAnyCached } from '@services/entity-fetch'
import { getTopicByAny } from '@services/topics'
import { createTopicAliases, linkTopicAlias, unlinkTopicAlias } from '@services/topics/aliases'
import {
  searchTopicAliases,
  topicAliasSearchCursorScope,
} from '@services/topics/search-topic-aliases'
import {
  getTopicAliasRecordByValue,
  getTopicAliasRecords,
} from '@services/topics/get-topic-aliases'
import { currentUserCanManageTopicAliases } from '@services/topics/authorization'
import { assertNotSuspended } from '@services/users'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedAliasCursor,
  encodeScopedAliasCursor,
} from '@modules/pagination'

const aliasSearchParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 24 },
})

app.route('/api/v1/topics/aliases').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/topics/aliases', aliasSearchParser)
  await requireAuthAndRateLimit(ctx, currentUserCanManageTopicAliases, 'GET:/api/v1/topics/aliases')

  const q = ctx.query.q ? String(ctx.query.q) : undefined
  ctx.assert(q, 400, 'q is required')

  const options = aliasSearchParser.parse(ctx.query)
  const scope = topicAliasSearchCursorScope({ prefixQuery: q })
  const after = options.after
    ? decodeScopedAliasCursor(options.after, scope, 'Invalid cursor format').alias
    : undefined
  const { results, hasNextPage } = await searchTopicAliases({
    prefixQuery: q,
    limit: options.limit,
    after,
  })
  ctx.json({
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeScopedAliasCursor(results[0].alias, scope) : null,
      end_cursor:
        hasNextPage && results.at(-1)
          ? encodeScopedAliasCursor(results.at(-1)!.alias, scope)
          : null,
    },
  })
})

const aliasesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

app
  .route('/api/v1/topics/:idOrSlug/aliases')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/topics/:idOrSlug/aliases', aliasesParser)
    await requireAuthAndRateLimit(
      ctx,
      currentUserCanManageTopicAliases,
      'GET:/api/v1/topics/:idOrSlug/aliases',
    )

    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    ctx.assert(topic, 404, 'Topic not found')

    const options = aliasesParser.parse(ctx.query)
    const scope = `topic-aliases:${topic.id}:alias-asc`
    const after = options.after
      ? decodeScopedAliasCursor(options.after, scope, 'Invalid cursor format').alias
      : undefined
    const { results, hasNextPage } = await getTopicAliasRecords(topic.id, {
      limit: options.limit,
      after,
    })
    ctx.json({
      // Keep `results` as the original string page for released native clients. Web clients use
      // the additive records field to retain stable IDs for mutations during the migration window.
      results: results.map(result => result.alias),
      alias_records: results,
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: results[0] ? encodeScopedAliasCursor(results[0].alias, scope) : null,
        end_cursor:
          hasNextPage && results.at(-1)
            ? encodeScopedAliasCursor(results.at(-1)!.alias, scope)
            : null,
      },
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanManageTopicAliases,
      'POST:/api/v1/topics/:idOrSlug/aliases',
    )
    assertNotSuspended(currentUser)

    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    ctx.assert(topic, 404, 'Topic not found')

    const body = (await ctx.request.json('1mb')) as { aliases: string | string[] }
    const { aliases } = body

    ctx.assert(
      typeof aliases === 'string' || Array.isArray(aliases),
      400,
      'aliases must be a string or array',
    )
    const added = await createTopicAliases(topic.id, aliases, { revisedById: currentUser.id })
    ctx.setStatus(201)
    ctx.json({ added })
  })

app
  .route('/api/v1/topics/:idOrSlug/aliases/:aliasId')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanManageTopicAliases,
      'POST:/api/v1/topics/:idOrSlug/aliases/:aliasId',
    )
    assertNotSuspended(currentUser)
    const aliasId = validateUUIDParam(ctx, 'aliasId')
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    ctx.assert(topic, 404, 'Topic not found')
    const alias = await linkTopicAlias(topic.id, aliasId, {
      revisedById: currentUser.id,
    })
    ctx.json({ alias })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanManageTopicAliases,
      'DELETE:/api/v1/topics/:idOrSlug/aliases/:aliasId',
    )
    assertNotSuspended(currentUser)
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    ctx.assert(topic, 404, 'Topic not found')

    const aliasReference = ctx.params.aliasId!
    const aliasId = isUuid(aliasReference)
      ? aliasReference
      : (await getTopicAliasRecordByValue(topic.id, aliasReference))?.id
    ctx.assert(aliasId, 404, 'Topic alias not found')

    const alias = await unlinkTopicAlias(aliasId, {
      revisedById: currentUser.id,
      expectedTopicId: topic.id,
    })
    ctx.assert(alias, 404, 'Topic alias not found')
    ctx.setStatus(204)
  })

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
