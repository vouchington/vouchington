import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { assertNotSuspended } from '@services/users/suspension'
import { attachWrittenPostProvenance } from '@services/content-provenance'
import { projectPublicTopicRecommendation } from '@services/topic-recommendations/public-projection'
import {
  asTopicRecommendationPost,
  currentUserCanEditTopicRecommendation,
  updateTopicRecommendation,
  type UpdateTopicRecommendationInput,
} from '@services/topic-recommendations'
import app from '../../../app.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/topic-recommendations/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/topic-recommendations/:id')
  assertNotSuspended(currentUser)

  const post = asTopicRecommendationPost(await getPostByAnyCached(ctx.params.id!))
  ctx.assert(post, 404, 'Recommendation not found')
  ctx.assert(currentUserCanEditTopicRecommendation(currentUser, post), 403, 'Forbidden')

  const body = (await parseJsonBody(ctx, '1mb')) as UpdateTopicRecommendationInput
  validateRequestContract(ctx, 'PATCH:/api/v1/topic-recommendations/:id', {
    body,
    path: ctx.params,
  })
  const recommendation = await updateTopicRecommendation(currentUser, post, body)
  ctx.json({
    post: projectPublicTopicRecommendation(await attachWrittenPostProvenance(recommendation, null)),
  })
})
