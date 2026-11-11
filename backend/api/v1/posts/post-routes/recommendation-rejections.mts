import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import {
  asTopicRecommendationPost,
  currentUserCanManageRecommendations,
  rejectTopicRecommendation,
} from '@services/topic-recommendations'
import { assertNotSuspended } from '@services/users'
import app from '../../../app.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/posts/:idOrSlug/rejections').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/posts/:idOrSlug/rejections')
  assertNotSuspended(currentUser)
  ctx.assert(currentUserCanManageRecommendations(currentUser), 403, 'Admin access required')

  const post = asTopicRecommendationPost(await getPostByAnyCached(ctx.params.idOrSlug!))
  ctx.assert(post, 404, 'Recommendation not found')

  const body = (await parseJsonBody(ctx, '1mb')) as { reason?: string }
  validateRequestContract(ctx, 'POST:/api/v1/posts/:idOrSlug/rejections', {
    body,
    path: ctx.params,
  })
  const recommendation = await rejectTopicRecommendation(currentUser, post, body.reason)
  ctx.json({ post: recommendation })
})
