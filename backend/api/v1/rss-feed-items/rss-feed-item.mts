import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import {
  getRssFeedItemElectionVotesByUser,
  getRssFeedItemElectionVotesByElectionId,
  getRssFeedItemElectionVotesByUserForEntity,
  getRssFeedItemElectionVote,
  upsertRssFeedItemElectionVotes,
} from '@services/elections-votes/rss-feed-item'
import { getRssFeedItemElectionByIdCachedBatch } from '@services/entity-fetch'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { getRssFeedItemEmbedsByItems } from '@services/rss-feed-items/get-rss-feed-item-embeds'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { proxyThumbnailUrls } from '@services/rss-feed-items'
import { sanitizeRssFeedItemContentHtml } from '@services/rss-feed-items/sanitize-content-html'
import { getFollowedUsersByElectionVote } from '@services/users/follow-context'
import { isUUID } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import { isAdminUser } from '@services/users'
import { createVoteClearHandler, createVoteHandler } from '../../election-vote-handler.mts'
import { createVoteStatsNoopReconciler } from '@services/elections-votes/shared'
import { enqueueBulkUpdateRssFeedItemElectionVoteStats } from '@queues/elections/enqueues'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiQuery,
  apiRequestContract,
} from '../../response-contract.mts'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
  requireAuth,
} from '../../response-helpers.mts'

app.route('/api/v1/rss-feed-items/:id').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/rss-feed-items/:id')
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid RSS feed item ID')
  const item = await getRssFeedItemById(ctx.params.id!)
  ctx.assert(item, 404, 'RSS feed item not found')

  setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

  const output: Record<string, unknown> = {
    rss_feed_item: proxyRssFeedItemCoverArt(item),
    rss_feed_item_election: getRssFeedItemElectionByIdCachedBatch([item.id]).then(
      elections => elections[0] ?? null,
    ),
    content_html: sanitizeRssFeedItemContentHtml(item.data),
    rss_feed_item_thumbnail_url: proxyThumbnailUrls([item]),
    rss_feed_item_embeds: getRssFeedItemEmbedsByItems(
      [item],
      {},
      isAdminUser(currentUser) ? 'administrator' : 'public',
    ),
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'rss_feed_item', [item.id]).then(
      bookmarks => (Object.keys(bookmarks).length > 0 ? bookmarks : undefined),
    )
    output.election_vote = getRssFeedItemElectionVotesByUser(currentUser.id, [item.id]).then(
      votes => votes[0] ?? null,
    )
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})

app.route('/api/v1/rss-feed-items/:id/follow-context').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/rss-feed-items/:id/follow-context')
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid RSS feed item ID')

  const item = await getRssFeedItemById(ctx.params.id!)
  ctx.assert(item, 404, 'RSS feed item not found')

  const [positive_by_following, negative_by_following] = await Promise.all([
    getFollowedUsersByElectionVote(currentUser, item.id, 'rss_feed_item_votes', 1),
    getFollowedUsersByElectionVote(currentUser, item.id, 'rss_feed_item_votes', -1),
  ])

  ctx.json({
    positive_by_following,
    negative_by_following,
  })
})

// PUT /api/v1/rss-feed-items/:id/vote
const rssFeedItemVoteHandler = createVoteHandler({
  rateLimitPrefix: 'rss-feed-item-election-vote',
  routeKey: 'PUT:/api/v1/rss-feed-items/:id/vote',
  entityType: 'rss_feed_item',
  getEntity: getRssFeedItemById,
  entityNotFoundMessage: 'RSS feed item not found',
  votePolicy: 'sentiment',
  getCurrentVote: getRssFeedItemElectionVote,
  upsertVotes: upsertRssFeedItemElectionVotes,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateRssFeedItemElectionVoteStats),
})

const clearRssFeedItemVoteHandler = createVoteClearHandler({
  rateLimitPrefix: 'rss-feed-item-election-vote',
  routeKey: 'DELETE:/api/v1/rss-feed-items/:id/vote',
  entityType: 'rss_feed_item',
  getEntity: getRssFeedItemById,
  entityNotFoundMessage: 'RSS feed item not found',
  votePolicy: 'sentiment',
  upsertVotes: upsertRssFeedItemElectionVotes,
  getCurrentVote: getRssFeedItemElectionVote,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateRssFeedItemElectionVoteStats),
})

app.route('/api/v1/rss-feed-items/:id/vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/rss-feed-items/:id/vote', ElectionVoteRequest<'sentiment'>>(
    'PUT:/api/v1/rss-feed-items/:id/vote',
  )
  apiOpenApiNoContent('PUT:/api/v1/rss-feed-items/:id/vote', 204)
  await rssFeedItemVoteHandler(ctx)
})

app.route('/api/v1/rss-feed-items/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/rss-feed-items/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/rss-feed-items/:id/vote', 204)
  await clearRssFeedItemVoteHandler(ctx)
})

const rssFeedItemVotesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

// GET /api/v1/rss-feed-items/:id/votes
app.route('/api/v1/rss-feed-items/:id/votes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/rss-feed-items/:id/votes', rssFeedItemVotesParser)
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')

  const currentUser = await requireAuth(ctx, 'GET:/api/v1/rss-feed-items/:id/votes')

  const item = await getRssFeedItemById(ctx.params.id!)
  ctx.assert(item, 404, 'RSS feed item not found')

  const { limit, after } = rssFeedItemVotesParser.parse(ctx.query)
  const collection = isAdminUser(currentUser)
    ? await getRssFeedItemElectionVotesByElectionId(ctx.params.id!, { limit, after })
    : await getRssFeedItemElectionVotesByUserForEntity(currentUser.id, ctx.params.id!, {
        limit,
        after,
      })
  ctx.json(collection)
})
