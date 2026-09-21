import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import {
  currentUserCanManageRecommendations,
  rejectTopicRecommendation,
} from '@services/topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { assertTopicRecommendationPost } from './shared.mts'

app.route('/api/v1/topic-recommendations/:id/rejections').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/topic-recommendations/:id/rejections')
  ctx.assert(currentUserCanManageRecommendations(currentUser), 403, 'Admin access required')

  const post = assertTopicRecommendationPost(await getPostByAnyCached(ctx.params.id!))
  ctx.assert(post, 404, 'Recommendation not found')

  const body = (await ctx.request.json('1mb')) as { reason?: string }
  const recommendation = await rejectTopicRecommendation(currentUser, post, body.reason)
  ctx.json({ post: recommendation })
})
