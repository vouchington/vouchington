import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryString } from '@vouchington/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { getTopicByAnyCached } from '@services/entity-fetch'
import { getTopicFollowContextBatch } from '@services/users/follow-context'
import app from '../../../app.mts'
import { apiQuery } from '../../../api-query-contract.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'

const followContextQuery = defineQueryContract({
  after: queryString({ description: 'Continuation cursor for the topic follower group' }),
})

app.route('/api/v1/topics/:idOrSlug/follow-context').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/topics/:idOrSlug/follow-context', followContextQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/follow-context')
  validateRequestContract(ctx, 'GET:/api/v1/topics/:idOrSlug/follow-context', {
    path: ctx.params,
    query: prepareQueryForValidation(ctx.query, followContextQuery.queryContract),
  })

  const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
  if (!topic) ctx.throw(404, 'Topic not found')

  const followContext = await getTopicFollowContextBatch(currentUser, topic.id, {
    after: typeof ctx.query.after === 'string' ? ctx.query.after : undefined,
  })

  ctx.json({
    positive_by_following: followContext.positiveByFollowing,
    negative_by_following: followContext.negativeByFollowing,
    following_topic_followers: followContext.followingTopicFollowers,
  })
})
