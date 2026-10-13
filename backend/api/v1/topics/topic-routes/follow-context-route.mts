import type { Context } from '@jongleberry/api-server'
import { getTopicByAnyCached } from '@services/entity-fetch'
import { getTopicFollowContextBatch } from '@services/users/follow-context'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/topics/:idOrSlug/follow-context').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/follow-context')
  validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/follow-context', { path: ctx.params })

  const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
  if (!topic) ctx.throw(404, 'Topic not found')

  const followContext = await getTopicFollowContextBatch(currentUser, topic.id)

  ctx.json({
    positive_by_following: followContext.positiveByFollowing,
    negative_by_following: followContext.negativeByFollowing,
    following_topic_followers: followContext.followingTopicFollowers,
  })
})
