import { streamJsonObject } from '@jongleberry/api-server'
import app from '../../app.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { searchTopHostnames } from '@services/urls-hostnames/search-top'
import { searchTopHostnamesCached } from '@services/entity-fetch/search-caches'
import {
  stripHostnameElectionFields,
  toPublicViewHostname,
  currentUserCanFilterHostnameModeration,
} from '@services/urls-hostnames'
import { getTopicIdByAnyCached } from '@services/entity-cache'
import {
  getHostnameElectionByIdCachedBatch,
  getTopicByAnyCachedBatch,
} from '@services/entity-fetch'
import { getTopUrlsByHostnameIds } from '@services/urls-hostnames/top-urls'
import { indexById } from '@modules/utils'
import { EMPTY_PAGE_INFO, getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { createPaginationParser } from '@modules/pagination'
import { clampAnonLimit } from '@modules/search-utils'

const topHostnamesParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/hostnames/top').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/hostnames/top')

  const paginationOptions = topHostnamesParser.parse(ctx.query)

  let topic_id: string | undefined
  if (ctx.query.topic) {
    const resolved = await getTopicIdByAnyCached(String(ctx.query.topic))
    if (!resolved) {
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
    topic_id = resolved
  }

  const searchOptions = { ...paginationOptions, ...(topic_id ? { topic_id } : {}) }
  if (!currentUser) searchOptions.limit = clampAnonLimit(searchOptions.limit)

  const { results, page_info } = currentUser
    ? await searchTopHostnames(searchOptions)
    : await searchTopHostnamesCached(searchOptions)

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  if (results.length === 0) {
    ctx.json({
      results: [],
      page_info,
      hostnames: {},
      topics: {},
      hostname_elections: {},
      top_urls_by_hostname_id: {},
    })
    return
  }

  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)
  const visibleHostnames = canSeeModeration
    ? results.map(stripHostnameElectionFields)
    : results.map(toPublicViewHostname)
  const hostnameIds = visibleHostnames.map(h => h.id)
  const topicIds = [...new Set(visibleHostnames.flatMap(h => (h.topic_id ? [h.topic_id] : [])))]
  const electionsPromise = getHostnameElectionByIdCachedBatch(hostnameIds).then(indexById)

  const output: Record<string, unknown> = {
    results: visibleHostnames.map(h => ({ __entity_type: 'hostname' as const, id: h.id })),
    page_info,
    hostnames: indexById(visibleHostnames),
    topics: topicIds.length > 0 ? getTopicByAnyCachedBatch(topicIds).then(indexById) : {},
    hostname_elections: electionsPromise,
    top_urls_by_hostname_id: getTopUrlsByHostnameIds(hostnameIds),
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
