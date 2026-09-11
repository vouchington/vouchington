import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getUrlHostnameByAnyCachedBatch,
  getHostnameElectionByIdCachedBatch,
  getTopicByAnyCachedBatch,
} from '@services/entity-fetch'
import {
  stripHostnameElectionFields,
  toPublicViewHostname,
  currentUserCanFilterHostnameModeration,
} from '@services/urls-hostnames'
import { indexById } from '@modules/utils'

app.route('/api/v1/hostnames/compare').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/hostnames/compare')

  const rawIds = ctx.query.ids ? String(ctx.query.ids) : ''
  if (!rawIds) {
    ctx.throw(400, 'Missing required query parameter: ids')
  }

  const ids = rawIds.split(',').flatMap(id => (id.trim() ? [id.trim()] : []))

  ctx.assert(ids.length > 0, 400, 'ids must contain at least one value')
  ctx.assert(ids.length <= 10, 400, 'ids must contain at most 10 values')

  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)

  const hostnameResults = await getUrlHostnameByAnyCachedBatch([...new Set(ids)])
  const hostnames = hostnameResults.flatMap(h => {
    if (!h) return []
    if (h.blocked && !canSeeModeration) return []
    return [canSeeModeration ? stripHostnameElectionFields(h) : toPublicViewHostname(h)]
  })

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const hostnameIds = [...new Set(hostnames.map(h => h.id))]
  const topicIds = [...new Set(hostnames.flatMap(h => (h.topic_id ? [h.topic_id] : [])))]

  const [hostname_elections, topics] = await Promise.all([
    getHostnameElectionByIdCachedBatch(hostnameIds).then(indexById),
    topicIds.length > 0 ? getTopicByAnyCachedBatch(topicIds).then(indexById) : Promise.resolve({}),
  ])

  ctx.json({
    hostnames: indexById(hostnames),
    hostname_elections,
    topics,
  })
})
