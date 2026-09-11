import app from '../../app.mts'
import { requireAuth } from '../../response-helpers.mts'
import { searchUrls } from '@services/urls'
import {
  currentUserCanFilterHostnameModeration,
  stripHostnameElectionFields,
  toPublicViewHostname,
} from '@services/urls-hostnames'
import { createPaginationParser } from '@modules/pagination'
import { parsePositiveBigintIdParam } from '@ts-shared/utils/bigint-ids'
import { apiResponse } from '../../response-contract.mts'

const urlsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})

app.route('/api/v1/urls').get(async ctx => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/urls')

  const paginationOptions = urlsParser.parse(ctx.query)

  const query = ctx.query.query ? String(ctx.query.query) : undefined
  const hostnameId = ctx.query.hostnameId ? String(ctx.query.hostnameId) : undefined
  const contentTypeId = ctx.query.contentTypeId
    ? parsePositiveBigintIdParam(ctx.query, 'contentTypeId')
    : undefined

  const canSeeModeration = currentUserCanFilterHostnameModeration(currentUser)
  const searchOptions = {
    query,
    hostnameId,
    contentTypeId,
    after: paginationOptions.after,
    limit: paginationOptions.limit,
    excludeBlockedHostnames: !canSeeModeration,
  }

  const result = await searchUrls(searchOptions)

  if (canSeeModeration) {
    const results = result.results.map(url => ({
      ...url,
      hostname: stripHostnameElectionFields(url.hostname),
    }))
    ctx.json({ ...result, results })
    return
  }

  const results = result.results.map(url => ({
    ...url,
    hostname: toPublicViewHostname(url.hostname),
  }))
  ctx.json(apiResponse('GET:/api/v1/urls#public', { ...result, results }))
})
