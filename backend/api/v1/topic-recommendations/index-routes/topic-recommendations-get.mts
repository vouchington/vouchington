import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import { maybeSanitizeElections } from '@services/elections-votes/shared/sanitize-election'
import {
  getPostByAnyCachedBatch,
  getPostElectionByIdCachedBatch,
  getPostMetricsByAnyCachedBatch,
  getUserPublicByAnyCachedBatch,
} from '@services/entity-fetch'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import {
  searchTopicRecommendations,
  type TopicRecommendationStatus,
} from '@services/topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

import { topicRecommendationsParser } from './shared.mts'

app.route('/api/v1/topic-recommendations').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topic-recommendations')
  const pagination = topicRecommendationsParser.parse(ctx.query)

  const result = await searchTopicRecommendations({
    status: ctx.query.status as TopicRecommendationStatus | undefined,
    q: typeof ctx.query.q === 'string' ? ctx.query.q : undefined,
    after: pagination.after,
    limit: pagination.limit,
  })

  const postIds = result.results.map(item => item.id)
  const postsPromise = getPostByAnyCachedBatch(postIds)
  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    posts: postsPromise.then(indexById),
    posts_metrics: getPostMetricsByAnyCachedBatch(postIds).then(indexById),
    post_elections: getPostElectionByIdCachedBatch(postIds)
      .then(indexById)
      .then(elections => maybeSanitizeElections(currentUser, elections)),
    markdown_to_html: postsPromise.then(async posts => {
      const postsMap = indexById(posts)
      const adminIds = await getAdminUserIdsFromPosts(posts)
      return renderMarkdownBatch(
        postIds.map(id => ({
          id,
          markdown: postsMap[id]?.markdown ?? '',
          created_by_id: postsMap[id]?.created_by_id ?? '',
        })),
        adminIds,
      )
    }),
  }

  output.bookmarks = postsPromise.then(async posts => {
    const entities = indexById(posts)
    const creatorIds = [
      ...new Set(
        Object.values(entities).flatMap(post => (post.created_by_id ? [post.created_by_id] : [])),
      ),
    ]

    const [postBookmarks, creatorBookmarks] = await Promise.all([
      getBookmarksForEntities(currentUser, 'post', postIds),
      creatorIds.length > 0
        ? getBookmarksForEntities(currentUser, 'user', creatorIds)
        : Promise.resolve({}),
    ])

    const bookmarks = { ...creatorBookmarks, ...postBookmarks }
    return Object.keys(bookmarks).length > 0 ? bookmarks : undefined
  })

  output.election_votes = postsPromise.then(async posts => {
    const filteredPostIds = posts.flatMap(post => (post != null ? [post.id] : []))
    if (filteredPostIds.length === 0) return undefined
    const votes = await getPostElectionVotesByUser(currentUser.id, filteredPostIds)
    const electionVotesRecord = electionVotesMapToRecord(
      new Map(votes.map(vote => [vote.entity_id, vote])),
    )
    return Object.keys(electionVotesRecord).length > 0 ? electionVotesRecord : undefined
  })

  output.users = postsPromise.then(async posts => {
    const reviewerIds = [
      ...new Set(
        posts.flatMap(post => {
          const id = post?.topic_recommendation?.reviewed_by_id
          return id ? [id] : []
        }),
      ),
    ]
    if (reviewerIds.length === 0) return undefined
    const users = await getUserPublicByAnyCachedBatch(reviewerIds)
    const usersById = indexById(users.filter(Boolean))
    return Object.keys(usersById).length > 0 ? usersById : undefined
  })

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
