import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import {
  searchUrlHostnames,
  currentUserCanFilterHostnameModeration,
  getTopUrlsByHostnameIds,
  stripHostnameElectionFields,
  toPublicViewHostname,
  upsertUrlHostnames,
} from '@services/urls-hostnames'
import { searchUrlHostnamesCached } from '@services/entity-fetch/search-caches'
import { parseHostnamesSearchParams } from '@services/search-params'
import {
  EMPTY_PAGE_INFO,
  getOptionalAuthAndRateLimit,
  requireAuthAndRateLimit,
  parseJsonBody,
} from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { getHostnameElectionVotesByUser } from '@services/elections-votes/hostname'
import {
  getHostnameElectionByIdCachedBatch,
  getTopicByAnyCachedBatch,
} from '@services/entity-fetch'
import { indexById } from '@modules/utils'
import { clampAnonLimit, ANON_MAX_LIMIT } from '@modules/search-utils'
import { isAdminUser } from '@services/users'
import { upsertAndBlockHostname } from '@services/hostname-blocking'
import { normalizeHostname } from '@ts-shared/utils/urls'

// POST /api/v1/hostnames - Admin: upsert a hostname by string and optionally block it
app.route('/api/v1/hostnames').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(ctx, isAdminUser, 'POST:/api/v1/hostnames')

  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const rawHostname = typeof body.hostname === 'string' ? body.hostname.trim() : ''
  ctx.assert(rawHostname, 422, 'hostname is required')

  const hostname = normalizeHostname(rawHostname)
  ctx.assert(hostname, 422, 'Invalid hostname')

  if (body.blocked === true) {
    const { id, result } = await upsertAndBlockHostname(currentUser.id, hostname)
    ctx.json({ id, hostname, ...result })
    return
  }

  const hostnameMap = await upsertUrlHostnames(currentUser.id, [hostname])
  const id = hostnameMap.get(hostname)
  ctx.assert(id, 500, 'Failed to upsert hostname')

  ctx.json({ id, hostname })
})

app.route('/api/v1/hostnames').get(async ctx => {
  apiQuery('GET:/api/v1/hostnames', parseHostnamesSearchParams)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/hostnames')
  const { shouldReturnEmpty, ...searchOptions } = await parseHostnamesSearchParams(
    ctx.query,
    currentUser,
  )
  if (!currentUser) {
    searchOptions.limit = clampAnonLimit(searchOptions.limit ?? ANON_MAX_LIMIT)
  }
  if (shouldReturnEmpty) {
    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }
    ctx.json({
      results: [],
      page_info: EMPTY_PAGE_INFO,
      hostnames: {},
      topics: {},
      hostname_elections: {},
      top_urls_by_hostname_id: {},
    })
    return
  }

  const { results: hostnames, page_info: hostnamesPageInfo } = currentUser
    ? await searchUrlHostnames(searchOptions)
    : await searchUrlHostnamesCached(searchOptions)

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)
  const visibleHostnames = canSeeModeration
    ? hostnames.map(stripHostnameElectionFields)
    : hostnames.map(toPublicViewHostname)
  const topicIds = [
    ...new Set(
      visibleHostnames.flatMap(hostname => (hostname.topic_id ? [hostname.topic_id] : [])),
    ),
  ]
  const hostnameIds = visibleHostnames.map(hostname => hostname.id)
  const electionsPromise = getHostnameElectionByIdCachedBatch(hostnameIds).then(indexById)

  const electionVotes =
    currentUser && hostnameIds.length > 0
      ? getHostnameElectionVotesByUser(currentUser.id, hostnameIds).then(votes => {
          if (votes.length === 0) return undefined
          return Object.fromEntries(votes.map(vote => [vote.entity_id, vote]))
        })
      : undefined
  const output = {
    results: visibleHostnames.map(h => ({ __entity_type: 'hostname' as const, id: h.id })),
    page_info: hostnamesPageInfo,
    hostnames: indexById(visibleHostnames),
    topics: getTopicByAnyCachedBatch(topicIds).then(indexById),
    hostname_elections: electionsPromise,
    top_urls_by_hostname_id: getTopUrlsByHostnameIds(hostnameIds),
    ...(electionVotes ? { election_votes: electionVotes } : {}),
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(apiResponse('GET:/api/v1/hostnames', output)))
})
