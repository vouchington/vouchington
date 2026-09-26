import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { getTopicByAnyCached } from '@services/entity-fetch'
import { getValidationInfoForReferralProgram } from '@services/referral-program-link-validations'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { assertNotSuspended } from '@services/users'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import {
  getReferralProgramAttributes,
  getRewardsProgramAttributes,
  getRewardsProgramStatusAttributes,
  getTopicByAny,
  updateReferralProgramAttributes,
  updateRewardsProgramAttributes,
  updateRewardsProgramStatusAttributes,
} from '@services/topics'

app
  .route('/api/v1/topics/:idOrSlug/rewards-program')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/rewards-program')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/rewards-program', {
      path: ctx.params,
    })
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')
    const attributes = await getRewardsProgramAttributes(topic)
    if (!attributes) ctx.throw(404, 'Rewards program attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ rewards_program_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/topics/:idOrSlug/rewards-program',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/rewards-program', {
      path: ctx.params,
    })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')
    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateRewardsProgramAttributes
    >[2]
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/rewards-program', {
      body: attributes,
    })
    ctx.json({
      rewards_program_attributes: await updateRewardsProgramAttributes(
        currentUser,
        topic,
        attributes,
      ),
    })
  })

app
  .route('/api/v1/topics/:idOrSlug/rewards-program-status')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/rewards-program-status')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/rewards-program-status', {
      path: ctx.params,
    })
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')
    const attributes = await getRewardsProgramStatusAttributes(topic)
    if (!attributes) ctx.throw(404, 'Rewards program status attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ rewards_program_status_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/topics/:idOrSlug/rewards-program-status',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/rewards-program-status', {
      path: ctx.params,
    })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')
    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateRewardsProgramStatusAttributes
    >[2]
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/rewards-program-status', {
      body: attributes,
    })
    ctx.json({
      rewards_program_status_attributes: await updateRewardsProgramStatusAttributes(
        currentUser,
        topic,
        attributes,
      ),
    })
  })

app
  .route('/api/v1/topics/:idOrSlug/referral-program')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/referral-program')
    validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/referral-program', {
      path: ctx.params,
    })
    const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')
    const attributes = await getReferralProgramAttributes(topic)
    if (!attributes) ctx.throw(404, 'Referral program attributes not found')
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
    ctx.json({ referral_program_attributes: attributes })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/topics/:idOrSlug/referral-program',
    )
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/referral-program', {
      path: ctx.params,
    })
    const topic = await getTopicByAny(ctx.params.idOrSlug!)
    if (!topic) ctx.throw(404, 'Topic not found')
    const attributes = (await ctx.request.json('1mb')) as Parameters<
      typeof updateReferralProgramAttributes
    >[2]
    validateRequestContract(ctx, 'PATCH:/api/v1/topics/:idOrSlug/referral-program', {
      body: attributes,
    })
    ctx.json({
      referral_program_attributes: await updateReferralProgramAttributes(
        currentUser,
        topic,
        attributes,
      ),
    })
  })

app.route('/api/v1/topics/:idOrSlug/referral-program/validation-info').get(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('GET:/api/v1/topics/:idOrSlug/referral-program/validation-info')
  validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/referral-program/validation-info', {
    path: ctx.params,
  })
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
