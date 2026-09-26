import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import {
  approveTopicRecommendation,
  currentUserCanManageRecommendations,
} from '@services/topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { assertTopicRecommendationPost } from './shared.mts'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

app.route('/api/v1/topic-recommendations/:id/approvals').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/topic-recommendations/:id/approvals')
  const provenance = getRequestContentProvenance()
  ctx.assert(currentUserCanManageRecommendations(currentUser), 403, 'Admin access required')

  const post = assertTopicRecommendationPost(await getPostByAnyCached(ctx.params.id!))
  ctx.assert(post, 404, 'Recommendation not found')

  const result = await approveTopicRecommendation(provenance, currentUser, post)
  ctx.json({
    post: result.recommendation,
    topic_id: result.topic_id,
    topic_slug: result.topic_slug,
    topic_type: result.topic_type,
  })
})
