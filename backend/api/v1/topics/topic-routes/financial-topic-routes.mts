import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { getTopicByAnyCached } from '@services/entity-fetch'
import {
  getCardAttributes,
  getReferralProgramAttributes,
  getRewardsProgramAttributes,
  getRewardsProgramStatusAttributes,
  getSpendingCategoryAttributes,
  getTopicByAny,
  replaceSpendingCategoryAttributes,
  updateCardAttributes,
  updateReferralProgramAttributes,
  updateRewardsProgramAttributes,
  updateRewardsProgramStatusAttributes,
  updateSpendingCategoryAttributes,
} from '@services/topics'
import { getValidationInfoForReferralProgram } from '@services/referral-program-link-validations'
import app from '../../../app.mts'
import { getOptionalAuthAndRateLimit, requireAuth } from '../../../response-helpers.mts'

app
  .route('/api/v1/topics/:idOrSlug/card')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/card')
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const cardAttributes = await getCardAttributes(topic)
    if (!cardAttributes) ctx.throw(404, 'Card attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ card_attributes: cardAttributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'PATCH:/api/v1/topics/:idOrSlug/card',
    )
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<typeof updateCardAttributes>[2]
    const updated = await updateCardAttributes(currentUser, topic, attributes)

    ctx.json({ card_attributes: updated })
  })

app
  .route('/api/v1/topics/:idOrSlug/spending-category')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/spending-category')
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = await getSpendingCategoryAttributes(topic)
    if (!attributes) ctx.throw(404, 'Spending category attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ spending_category_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/topics/:idOrSlug/spending-category')
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateSpendingCategoryAttributes
    >[2]
    const updated = await updateSpendingCategoryAttributes(currentUser, topic, attributes)

    ctx.json({ spending_category_attributes: updated })
  })
  .put(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PUT:/api/v1/topics/:idOrSlug/spending-category')
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof replaceSpendingCategoryAttributes
    >[2]
    const updated = await replaceSpendingCategoryAttributes(currentUser, topic, attributes)

    ctx.json({ spending_category_attributes: updated })
  })

app
  .route('/api/v1/topics/:idOrSlug/rewards-program')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/rewards-program')
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = await getRewardsProgramAttributes(topic)
    if (!attributes) ctx.throw(404, 'Rewards program attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ rewards_program_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'PATCH:/api/v1/topics/:idOrSlug/rewards-program',
    )
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateRewardsProgramAttributes
    >[2]
    const updated = await updateRewardsProgramAttributes(currentUser, topic, attributes)

    ctx.json({ rewards_program_attributes: updated })
  })

app
  .route('/api/v1/topics/:idOrSlug/rewards-program-status')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/rewards-program-status')
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = await getRewardsProgramStatusAttributes(topic)
    if (!attributes) ctx.throw(404, 'Rewards program status attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ rewards_program_status_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'PATCH:/api/v1/topics/:idOrSlug/rewards-program-status',
    )
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateRewardsProgramStatusAttributes
    >[2]
    const updated = await updateRewardsProgramStatusAttributes(currentUser, topic, attributes)

    ctx.json({ rewards_program_status_attributes: updated })
  })

app
  .route('/api/v1/topics/:idOrSlug/referral-program')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/referral-program')
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = await getReferralProgramAttributes(topic)
    if (!attributes) ctx.throw(404, 'Referral program attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ referral_program_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(
      ctx,
      'PATCH:/api/v1/topics/:idOrSlug/referral-program',
    )
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')

    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateReferralProgramAttributes
    >[2]
    const updated = await updateReferralProgramAttributes(currentUser, topic, attributes)

    ctx.json({ referral_program_attributes: updated })
  })

// GET /api/v1/topics/:idOrSlug/referral-program/validation-info
app.route('/api/v1/topics/:idOrSlug/referral-program/validation-info').get(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/referral-program/validation-info')

  const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
  if (!topic) ctx.throw(404, 'Topic not found')

  const referralProgramId =
    topic.topic_type === 'referral_program' ? topic.id : topic.referral_program_id

  if (!referralProgramId) ctx.throw(404, 'Topic is not linked to a referral program')

  const info = await getValidationInfoForReferralProgram(referralProgramId)
  if (!info) ctx.throw(404, 'No validation info found')

  ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
  ctx.json({ validation_info: info })
})
