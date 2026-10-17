import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { addPostRating, updatePostRating, deletePostRating } from '@services/posts/post-ratings'
import { getAuthorizedPostContributionMembershipPlan } from '@services/posts/authorization'
import {
  assertPostRatingOrderIndex,
  assertPostRatingTopicId,
  assertPostRatingValue,
  loadPostRatingTarget,
} from '@services/posts/post-rating-target'
import { assertNotSuspended } from '@services/users'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'

type CreatePostRatingBody = {
  topic_id: string
  rating: number
  order_index: number
}

type UpdatePostRatingBody = {
  rating?: number
  order_index?: number
}

app.route('/api/v1/posts/:idOrSlug/ratings').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/posts/:idOrSlug/ratings')
  assertNotSuspended(currentUser)
  const membershipPlan = await getAuthorizedPostContributionMembershipPlan(currentUser)

  const post = await loadPostRatingTarget(currentUser, ctx.params.idOrSlug!)

  const body = (await ctx.request.json('1mb')) as CreatePostRatingBody
  validateRequestContract(ctx, 'POST:/api/v1/posts/:idOrSlug/ratings', {
    body,
    path: ctx.params,
  })
  const { topic_id, rating, order_index } = body
  assertPostRatingTopicId(topic_id)
  assertPostRatingValue(rating)
  assertPostRatingOrderIndex(order_index)
  await assertWithinContributionActionLimit(currentUser, membershipPlan, 'post_rating')

  await addPostRating(currentUser, post, { topic_id, rating, order_index })
  ctx.setStatus(204)
})

app.route('/api/v1/posts/:idOrSlug/ratings/:topicId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/posts/:idOrSlug/ratings/:topicId')
  assertNotSuspended(currentUser)
  const membershipPlan = await getAuthorizedPostContributionMembershipPlan(currentUser)

  const post = await loadPostRatingTarget(currentUser, ctx.params.idOrSlug!)
  ctx.assert(isUUID(ctx.params.topicId!), 422, 'Invalid topic_id')

  const body = (await ctx.request.json('1mb')) as UpdatePostRatingBody
  validateRequestContract(ctx, 'PATCH:/api/v1/posts/:idOrSlug/ratings/:topicId', {
    body,
    path: ctx.params,
  })
  const { rating, order_index } = body
  ctx.assert(
    rating !== undefined || order_index !== undefined,
    422,
    'At least one of rating or order_index must be provided',
  )
  if (rating !== undefined) assertPostRatingValue(rating)
  if (order_index !== undefined) assertPostRatingOrderIndex(order_index)
  await assertWithinContributionActionLimit(currentUser, membershipPlan, 'post_rating')

  await updatePostRating(currentUser, post, ctx.params.topicId!, {
    rating: typeof rating === 'number' ? rating : undefined,
    order_index: typeof order_index === 'number' ? order_index : undefined,
  })
  ctx.setStatus(204)
})

app.route('/api/v1/posts/:idOrSlug/ratings/:topicId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/posts/:idOrSlug/ratings/:topicId')
  assertNotSuspended(currentUser)

  const post = await loadPostRatingTarget(currentUser, ctx.params.idOrSlug!)
  validateRequestContract(ctx, 'DELETE:/api/v1/posts/:idOrSlug/ratings/:topicId', {
    path: ctx.params,
  })
  const topicId = validateUUIDParam(ctx, 'topicId')

  await deletePostRating(currentUser, post, topicId)
  ctx.setStatus(204)
})
