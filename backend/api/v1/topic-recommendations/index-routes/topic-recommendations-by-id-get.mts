import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import {
  getPostByAnyCached,
  getPostElectionByIdCachedBatch,
  getPostMetricsByAnyCached,
  getUserPublicByAnyCached,
} from '@services/entity-fetch'
import renderMarkdown from '@services/markdown'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { currentUserCanViewTopicRecommendation } from '@services/topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { assertTopicRecommendationPost } from './shared.mts'

app.route('/api/v1/topic-recommendations/:id').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topic-recommendations/:id')

  const post = assertTopicRecommendationPost(await getPostByAnyCached(ctx.params.id!))
  ctx.assert(post, 404, 'Recommendation not found')
  ctx.assert(currentUserCanViewTopicRecommendation(currentUser, post), 403, 'Forbidden')

  const adminIds = await getAdminUserIdsFromPosts([post])
  const isAdminMarkdown = post.created_by_id ? adminIds.has(post.created_by_id) : false
  const html = post.markdown
    ? await renderMarkdown(post.markdown, {
        allowHtml: isAdminMarkdown,
        nofollowLinks: !isAdminMarkdown,
        proxyImages: true,
      })
    : ''

  const output: Record<string, unknown> = {
    post,
    html,
    post_metrics: getPostMetricsByAnyCached(post.id),
    post_election: getPostElectionByIdCachedBatch([post.id]).then(
      elections => elections[0] ?? null,
    ),
    bookmarks: getBookmarksForEntities(currentUser, 'post', [post.id]).then(bookmarks =>
      Object.keys(bookmarks).length > 0 ? bookmarks : undefined,
    ),
    election_vote: getPostElectionVotesByUser(currentUser.id, [post.id]).then(
      votes => votes[0] ?? null,
    ),
  }

  const reviewedById = post.topic_recommendation?.reviewed_by_id
  if (reviewedById) {
    output.users = getUserPublicByAnyCached(reviewedById).then(user =>
      user ? { [reviewedById]: user } : undefined,
    )
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
