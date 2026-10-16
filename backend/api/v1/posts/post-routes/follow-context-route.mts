import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { canViewPost } from '@services/posts'
import { getVoteFollowContextBatch } from '@services/users/follow-context'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { getRouteAccessPost } from '@services/posts/route-access'

app.route('/api/v1/posts/:idOrSlug/follow-context').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/posts/:idOrSlug/follow-context')
  validateRequestContract(ctx, 'GET:/api/v1/posts/:idOrSlug/follow-context', { path: ctx.params })

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const privacyPost = await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  const followContext = await getVoteFollowContextBatch(currentUser, post.id, 'post_votes')

  ctx.json({
    positive_by_following: followContext.positiveByFollowing,
    negative_by_following: followContext.negativeByFollowing,
  })
})
