import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getTopicElectionVotesByElectionId,
  getTopicElectionVotesByUserForEntity,
} from '@services/elections-votes/topic'
import { getTopicByAnyCached } from '@services/entity-fetch'
import {
  getRetailerAttributes,
  getRetailerCountries,
  getTopicByAny,
  updateRetailerAttributes,
  updateRetailerCountries,
} from '@services/topics'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import app from '../../../app.mts'
import { apiQuery } from '../../../response-contract.mts'
import {
  requireAuth,
  requireAuthAndRateLimit,
  validateRequestContract,
} from '../../../response-helpers.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

app
  .route('/api/v1/topics/:idOrSlug/retailer')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/retailer')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/retailer', { path: ctx.params })
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = await getRetailerAttributes(topic)
    if (!attributes) ctx.throw(404, 'Retailer attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ retailer_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/topics/:idOrSlug/retailer',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/retailer', { path: ctx.params })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const updated = await updateRetailerAttributes(currentUser, topic)

    ctx.json({ retailer_attributes: updated })
  })

app
  .route('/api/v1/topics/:idOrSlug/retailer/countries')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/retailer/countries')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/retailer/countries', {
      path: ctx.params,
    })
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = await getRetailerAttributes(topic)
    if (!attributes) ctx.throw(404, 'Retailer attributes not found')

    const countries = await getRetailerCountries(topic)
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ results: countries })
  })
  .put(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PUT:/api/v1/topics/:idOrSlug/retailer/countries',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PUT:/api/v1/topics/:idOrSlug/retailer/countries', {
      path: ctx.params,
    })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const body = (await ctx.request.json('1mb')) as { country_ids: number[] }
    validateRequestContract(ctx, 'PUT:/api/v1/topics/:idOrSlug/retailer/countries', {
      body,
    })
    const { country_ids } = body
    ctx.assert(Array.isArray(country_ids), 422, 'country_ids must be an array')
    ctx.assert(
      country_ids.every(id => Number.isInteger(id) && id > 0),
      422,
      'country_ids must contain positive integers',
    )

    const countries = await updateRetailerCountries(currentUser, topic, country_ids)
    ctx.json({ results: countries })
  })

const topicVotesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

// GET /api/v1/topics/:id/votes
app.route('/api/v1/topics/:id/votes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/topics/:id/votes', topicVotesParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:id/votes')
  const { limit, after } = topicVotesParser.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, topicVotesParser.queryContract)
  if (ctx.query.limit !== undefined) query.limit = limit
  validateRequestContract(ctx, 'GET:/api/v1/topics/:id/votes', { path: ctx.params, query })
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')

  const topic = await getTopicByAnyCached(ctx.params.id!)
  ctx.assert(topic, 404, 'Topic not found')

  const collection = isAdminUser(currentUser)
    ? await getTopicElectionVotesByElectionId(ctx.params.id!, { limit, after })
    : await getTopicElectionVotesByUserForEntity(currentUser.id, ctx.params.id!, { limit, after })
  ctx.json(collection)
})
