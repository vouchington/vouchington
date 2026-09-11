import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getFriendTrustedHostnames } from '@services/urls-hostnames/social'
import { toPublicViewHostname, getUrlHostnamesByAnyBatch } from '@services/urls-hostnames'
import {
  getHostnameElectionByIdCachedBatch,
  getTopicByAnyCachedBatch,
} from '@services/entity-fetch'
import { indexById } from '@modules/utils'
import { requireAuth } from '../../response-helpers.mts'
import { createPaginationParser } from '@modules/pagination'

const socialHostnamesParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/hostnames/social').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/hostnames/social')

  ctx.set('Cache-Control', 'private, no-store')

  const paginationOptions = socialHostnamesParser.parse(ctx.query)

  const { results, page_info } = await getFriendTrustedHostnames(currentUser.id, paginationOptions)

  if (results.length === 0) {
    ctx.json({
      results: [],
      page_info,
      hostnames: {},
      hostname_elections: {},
      topics: {},
      social_by_hostname_id: {},
    })
    return
  }

  const hostnameIds = results.map(r => r.id)

  const hostnamesPromise = getUrlHostnamesByAnyBatch(hostnameIds).then(hostnames => {
    const visible = hostnames.flatMap(h => (h ? [toPublicViewHostname(h)] : []))
    return indexById(visible)
  })

  const topicIdsPromise = hostnamesPromise.then(hostnameMap => {
    return [
      ...new Set(
        Object.values(hostnameMap as Record<string, { topic_id?: string | null }>).flatMap(h =>
          h.topic_id ? [h.topic_id] : [],
        ),
      ),
    ]
  })

  const output: Record<string, unknown> = {
    results: results.map(r => ({ __entity_type: 'hostname' as const, id: r.id })),
    page_info,
    hostnames: hostnamesPromise,
    hostname_elections: getHostnameElectionByIdCachedBatch(hostnameIds).then(indexById),
    topics: topicIdsPromise.then(topicIds =>
      topicIds.length > 0 ? getTopicByAnyCachedBatch(topicIds).then(indexById) : {},
    ),
    social_by_hostname_id: Object.fromEntries(
      results.map(r => [
        r.id,
        { friend_upvote_count: r.friend_upvote_count, friend_voter_ids: r.friend_voter_ids },
      ]),
    ),
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
