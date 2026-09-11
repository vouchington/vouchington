import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import {
  currentUserCanEditTopicRecommendation,
  updateTopicRecommendation,
  type UpdateTopicRecommendationInput,
} from '@services/wikipedia-topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { assertTopicRecommendationPost } from './shared.mts'

app.route('/api/v1/topic-recommendations/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/topic-recommendations/:id')

  const post = assertTopicRecommendationPost(await getPostByAnyCached(ctx.params.id!))
  ctx.assert(post, 404, 'Recommendation not found')
  ctx.assert(currentUserCanEditTopicRecommendation(currentUser, post), 403, 'Forbidden')

  const body = (await ctx.request.json('1mb')) as UpdateTopicRecommendationInput
  const recommendation = await updateTopicRecommendation(currentUser, post, body)
  ctx.json({ post: recommendation })
})
