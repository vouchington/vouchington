import type { Context } from '@jongleberry/api-server'
import { getTopicByAnyCached } from '@services/entity-fetch'
import {
  getFollowedUsersByElectionVote,
  getFollowedUsersFollowingTopic,
} from '@services/users/follow-context'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/topics/:idOrSlug/follow-context').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topics/:idOrSlug/follow-context')

  const topic = await getTopicByAnyCached(ctx.params.idOrSlug!)
  if (!topic) ctx.throw(404, 'Topic not found')

  const [positive_by_following, negative_by_following, following_topic_followers] =
    await Promise.all([
      getFollowedUsersByElectionVote(currentUser, topic.id, 'topic_votes', 1),
      getFollowedUsersByElectionVote(currentUser, topic.id, 'topic_votes', -1),
      getFollowedUsersFollowingTopic(currentUser, topic.id),
    ])

  ctx.json({
    positive_by_following,
    negative_by_following,
    following_topic_followers,
  })
})
