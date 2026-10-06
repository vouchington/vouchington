import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getTopicByAnyCached,
  getUrlHostnameByAnyCached,
  getHostnameElectionByIdCachedBatch,
} from '@services/entity-fetch/get'
import { getCrawlersForHostname } from '@services/crawlers'
import { attachRssFeedProvenance, attachTopicProvenance } from '@services/content-provenance'
import {
  currentUserCanFilterHostnameModeration,
  stripHostnameElectionFields,
  toPublicViewHostname,
  updateUrlHostname,
  searchBlockedHostnames,
} from '@services/urls-hostnames'
import { blockHostname, unblockHostname } from '@services/hostname-blocking'
import {
  getHostnameElectionVote,
  getHostnameElectionVotesByElectionId,
  getHostnameElectionVotesByUserForEntity,
} from '@services/elections-votes/hostname'
import { searchUrls } from '@services/urls/search'
import { searchRssFeeds } from '@services/rss-feeds'
import { proxyRssFeedCoverArt } from '@services/rss-feeds/proxy-cover-art'
import { isUUID } from '@modules/utils'
import {
  createPaginationParser,
  defineQueryContract,
  queryInteger,
  queryString,
} from '@modules/pagination'
import { isAdminUser } from '@services/users'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
  requireAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
} from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import { readHostnameChanges } from './hostname-update.mts'
import type { UpdateHostnameBody } from './hostname-update-types.mts'
import './hostname-vote-routes.mts'

const blockedHostnamesQuery = defineQueryContract({
  limit: queryInteger({ minimum: 1, maximum: 100, default: 25 }),
  after: queryString(),
})

// GET /api/v1/hostnames/blocked - Admin: list all site-wide blocked hostnames
app.route('/api/v1/hostnames/blocked').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/hostnames/blocked', blockedHostnamesQuery)
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/hostnames/blocked')

  const rawLimit = parseInt(ctx.query.limit as string, 10)
  const limit = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 25))
  const after = ctx.query.after as string | undefined
  validateRequestContract(ctx, 'GET:/api/v1/hostnames/blocked', {
    query: {
      limit,
      ...(after ? { after } : {}),
    },
  })

  const { results, page_info } = await searchBlockedHostnames({ limit, after })
  ctx.json({ results, page_info })
})

app.route('/api/v1/hostnames/:id').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/hostnames/:id')
  validateRequestContract(ctx, 'GET:/api/v1/hostnames/:id', { path: ctx.params })
  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)

  const hostname = await getUrlHostnameByAnyCached(ctx.params.id!)
  if (!hostname || (hostname.is_blocked && !canSeeModeration)) {
    ctx.setStatus(404)
    return ctx.json({ error: 'Hostname not found' })
  }

  setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

  const cachedTopic = hostname.topic_id ? await getTopicByAnyCached(hostname.topic_id) : null
  const [[topic = null], hostnameElection, electionVote, topUrls, rssFeeds] = await Promise.all([
    attachTopicProvenance([cachedTopic], currentUser),
    getHostnameElectionByIdCachedBatch([hostname.id]).then(elections => elections[0] ?? null),
    currentUser ? getHostnameElectionVote(currentUser.id, hostname.id) : Promise.resolve(null),
    searchUrls({ hostnameId: hostname.id, limit: 25, excludeBlockedHostnames: true }).then(
      result => result.results,
    ),
    cachedTopic
      ? searchRssFeeds({ topic_id: cachedTopic.id, is_enabled: null, limit: 25 }).then(feeds =>
          attachRssFeedProvenance(feeds.map(proxyRssFeedCoverArt), currentUser),
        )
      : Promise.resolve([]),
  ])

  if (canSeeModeration) {
    const crawlers = await getCrawlersForHostname(hostname.id)
    ctx.json({
      hostname: stripHostnameElectionFields(hostname),
      crawlers,
      topic,
      top_urls: topUrls,
      rss_feeds: rssFeeds,
      hostname_election: hostnameElection,
      election_vote: electionVote,
    })
    return
  }

  ctx.json(
    apiResponse('GET:/api/v1/hostnames/:id#public', {
      hostname: toPublicViewHostname(hostname),
      topic,
      top_urls: topUrls,
      rss_feeds: rssFeeds,
      hostname_election: hostnameElection,
      election_vote: electionVote,
    }),
  )
})

// PATCH /api/v1/hostnames/:id - Admin: update hostname fields
app.route('/api/v1/hostnames/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(ctx, isAdminUser, 'PATCH:/api/v1/hostnames/:id')
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')

  const body = (await ctx.request.json('10kb')) as UpdateHostnameBody
  validateRequestContract(ctx, 'PATCH:/api/v1/hostnames/:id', { body, path: ctx.params })
  const changes = readHostnameChanges(body)

  const hostname = await getUrlHostnameByAnyCached(ctx.params.id!)
  ctx.assert(hostname, 404, 'Hostname not found')

  ctx.assert(Object.keys(changes).length > 0, 422, 'No valid fields to update')

  // Blocking a hostname triggers the full blocking flow: soft-delete URL entity relations
  // and apply vote weight penalties to users who linked content from this hostname.
  // Combining is_blocked:true with other fields is not allowed — it would silently ignore them.
  if (changes.is_blocked === true) {
    ctx.assert(
      Object.keys(changes).length === 1,
      422,
      'Cannot combine is_blocked:true with other fields',
    )
    const result = await blockHostname(currentUser.id, ctx.params.id!)
    ctx.json(result)
    return
  }

  if (changes.is_blocked === false) {
    await unblockHostname(currentUser.id, ctx.params.id!)
    // Remove blocked from changes so updateUrlHostname doesn't try to set it
    const { is_blocked: _b, ...rest } = changes
    if (Object.keys(rest).length > 0) {
      await updateUrlHostname(ctx.params.id!, rest)
    }
    ctx.setStatus(204)
    return
  }

  await updateUrlHostname(ctx.params.id!, changes)
  ctx.setStatus(204)
})

const hostnameVotesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

// GET /api/v1/hostnames/:id/votes
app.route('/api/v1/hostnames/:id/votes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/hostnames/:id/votes', hostnameVotesParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/hostnames/:id/votes')
  ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')
  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/hostnames/:id/votes',
    hostnameVotesParser,
    { path: true },
  )

  const hostname = await getUrlHostnameByAnyCached(ctx.params.id!)
  ctx.assert(hostname, 404, 'Hostname not found')

  const collection = isAdminUser(currentUser)
    ? await getHostnameElectionVotesByElectionId(ctx.params.id!, { limit, after })
    : await getHostnameElectionVotesByUserForEntity(currentUser.id, ctx.params.id!, {
        limit,
        after,
      })
  ctx.json(collection)
})
