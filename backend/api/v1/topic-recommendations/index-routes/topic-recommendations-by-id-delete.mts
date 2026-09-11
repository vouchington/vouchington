import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { deletePendingRecommendation } from '@services/wikipedia-topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { assertTopicRecommendationPost } from './shared.mts'

app.route('/api/v1/topic-recommendations/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/topic-recommendations/:id')

  const post = assertTopicRecommendationPost(await getPostByAnyCached(ctx.params.id!))
  ctx.assert(post, 404, 'Recommendation not found')

  await deletePendingRecommendation(currentUser, post)
  ctx.setStatus(200)
  ctx.response.empty()
})
