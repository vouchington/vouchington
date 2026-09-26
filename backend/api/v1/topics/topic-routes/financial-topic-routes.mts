import type { Context } from '@jongleberry/api-server'
import './financial-topic-routes-programs.mts'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { getTopicByAnyCached } from '@services/entity-fetch'
import {
  getCardAttributes,
  getSpendingCategoryAttributes,
  getTopicByAny,
  replaceSpendingCategoryAttributes,
  updateCardAttributes,
  updateSpendingCategoryAttributes,
} from '@services/topics'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { assertNotSuspended } from '@services/users'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app
  .route('/api/v1/topics/:idOrSlug/card')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/card')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/card', { path: ctx.params })
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const cardAttributes = await getCardAttributes(topic)
    if (!cardAttributes) ctx.throw(404, 'Card attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ card_attributes: cardAttributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/topics/:idOrSlug/card',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/card', { path: ctx.params })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<typeof updateCardAttributes>[2]
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/card', { body: attributes })
    const updated = await updateCardAttributes(currentUser, topic, attributes)

    ctx.json({ card_attributes: updated })
  })

app
  .route('/api/v1/topics/:idOrSlug/spending-category')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/spending-category')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/spending-category', {
      path: ctx.params,
    })
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = await getSpendingCategoryAttributes(topic)
    if (!attributes) ctx.throw(404, 'Spending category attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ spending_category_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/topics/:idOrSlug/spending-category',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/spending-category', {
      path: ctx.params,
    })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateSpendingCategoryAttributes
    >[2]
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/spending-category', {
      body: attributes,
    })
    const updated = await updateSpendingCategoryAttributes(currentUser, topic, attributes)

    ctx.json({ spending_category_attributes: updated })
  })
  .put(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PUT:/api/v1/topics/:idOrSlug/spending-category',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PUT:/api/v1/topics/:idOrSlug/spending-category', {
      path: ctx.params,
    })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof replaceSpendingCategoryAttributes
    >[2]
    validateRequestContract(ctx, 'PUT:/api/v1/topics/:idOrSlug/spending-category', {
      body: attributes,
    })
    const updated = await replaceSpendingCategoryAttributes(currentUser, topic, attributes)

    ctx.json({ spending_category_attributes: updated })
  })
