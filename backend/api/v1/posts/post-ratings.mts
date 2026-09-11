import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { getPostByAnyCached } from '@services/entity-fetch'
import { addPostRating, updatePostRating, deletePostRating } from '@services/posts/post-ratings'
import { currentUserCanUpdatePost } from '@services/posts/authorization'
import { assertNotSuspended } from '@services/users'
import { getUserActivePlan } from '@services/memberships'
import { assertCanContribute } from '@services/contribution-gating/assert'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getRouteAccessPost } from './get-route-access-post.mts'
import { requireAuth } from '../../response-helpers.mts'

app.route('/api/v1/posts/:idOrSlug/ratings').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/posts/:idOrSlug/ratings')
  assertNotSuspended(currentUser)
  // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(post), 404, 'Post not found')
  ctx.assert(currentUserCanUpdatePost(currentUser, post), 403, 'Forbidden')
  ctx.assert(post.post_type === 'review', 422, 'Post is not a review')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const { topic_id, rating, order_index } = body
  ctx.assert(typeof topic_id === 'string', 422, 'topic_id must be a string')
  ctx.assert(isUUID(topic_id), 422, 'Invalid topic_id')
  ctx.assert(
    typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5,
    422,
    'Rating must be an integer between 1 and 5',
  )
  ctx.assert(
    typeof order_index === 'number' && Number.isInteger(order_index) && order_index >= 0,
    422,
    'order_index must be a non-negative integer',
  )
  await assertWithinContributionActionLimit(currentUser, membershipPlan, 'post_rating')

  await addPostRating(currentUser, post, { topic_id, rating, order_index })
  ctx.setStatus(204)
})

app.route('/api/v1/posts/:idOrSlug/ratings/:topicId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/posts/:idOrSlug/ratings/:topicId')
  assertNotSuspended(currentUser)
  // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(post), 404, 'Post not found')
  ctx.assert(currentUserCanUpdatePost(currentUser, post), 403, 'Forbidden')
  ctx.assert(post.post_type === 'review', 422, 'Post is not a review')
  ctx.assert(isUUID(ctx.params.topicId!), 422, 'Invalid topic_id')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const { rating, order_index } = body
  ctx.assert(
    rating !== undefined || order_index !== undefined,
    422,
    'At least one of rating or order_index must be provided',
  )
  if (rating !== undefined) {
    ctx.assert(
      typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5,
      422,
      'Rating must be an integer between 1 and 5',
    )
  }
  if (order_index !== undefined) {
    ctx.assert(
      typeof order_index === 'number' && Number.isInteger(order_index) && order_index >= 0,
      422,
      'order_index must be a non-negative integer',
    )
  }
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

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(post), 404, 'Post not found')

  await deletePostRating(currentUser, post, ctx.params.topicId!)
  ctx.setStatus(204)
})
