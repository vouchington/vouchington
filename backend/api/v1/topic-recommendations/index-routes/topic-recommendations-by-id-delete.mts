import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { assertNotSuspended } from '@services/users/suspension'
import {
  asTopicRecommendationPost,
  deletePendingRecommendation,
} from '@services/topic-recommendations'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/topic-recommendations/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/topic-recommendations/:id')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'DELETE:/api/v1/topic-recommendations/:id', { path: ctx.params })

  const post = asTopicRecommendationPost(await getPostByAnyCached(ctx.params.id!))
  ctx.assert(post, 404, 'Recommendation not found')

  await deletePendingRecommendation(currentUser, post)
  ctx.setStatus(200)
  ctx.response.empty()
})
