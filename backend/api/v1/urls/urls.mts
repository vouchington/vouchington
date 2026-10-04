import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import {
  createPaginationParser,
  defineQueryContract,
  queryString,
  queryUuid,
} from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { searchUrls } from '@services/urls'
import {
  currentUserCanFilterHostnameModeration,
  stripHostnameElectionFields,
  toPublicViewHostname,
} from '@services/urls-hostnames'
import { parsePositiveBigintIdParam } from '@ts-shared/utils/bigint-ids'

const urlsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})
const urlsFilters = defineQueryContract({
  query: queryString(),
  hostnameId: queryUuid(),
  contentTypeId: queryString({ description: 'Positive PostgreSQL bigint identifier.' }),
})

app.route('/api/v1/urls').get(async ctx => {
  apiQuery('GET:/api/v1/urls', urlsParser, urlsFilters)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/urls')

  const paginationOptions = parseRuntimePagination(urlsParser, ctx.query)

  const query = ctx.query.query ? String(ctx.query.query) : undefined
  const hostnameId = ctx.query.hostnameId ? String(ctx.query.hostnameId) : undefined
  const contentTypeId = ctx.query.contentTypeId
    ? parsePositiveBigintIdParam(ctx.query, 'contentTypeId')
    : undefined
  const validationQuery = prepareQueryForValidation(ctx.query, {
    ...urlsParser.queryContract,
    ...urlsFilters.queryContract,
  })
  if (ctx.query.limit !== undefined) validationQuery.limit = paginationOptions.limit
  const validatedQuery = Object.fromEntries(
    Object.entries(validationQuery).filter(
      ([key]) => key !== 'contentTypeId' || contentTypeId !== undefined,
    ),
  )
  validateRequestContract(ctx, 'GET:/api/v1/urls', { query: validatedQuery })

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
