import { parseBooleanish } from '@ts-shared/utils/query'
import {
  type PaginationRuntimeLimitBounds,
  createPaginationParser,
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryEnum,
  queryNullableBoolean,
  queryString,
  withQueryContract,
} from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanFilterHostnameModeration } from '@services/urls-hostnames'
import { getTopicIdByAnyCached, getTopicIdsByAnyCachedBatch } from '@services/entity-cache'
import { extractIdentifier, extractIdentifiers, checkShouldReturnEmpty } from './resolve.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { prepareQueryForValidation } from './prepare-query.mts'

function parseModerationBooleanParam(canFilter: boolean, value: unknown): boolean | undefined {
  if (!canFilter || value === undefined || value === 'null') return undefined
  return parseBooleanish(value)
}

const hostnamesParser = createPaginationParser({
  cursor: { type: ['name', 'score'] as const },
  limit: { min: 1, max: 100, default: 50 },
  filters: { sort: ['trust'] as const },
})

const hostnamesQueryContract = defineQueryContract({
  query: queryString(),
  hostname: queryString(),
  topic: queryString(),
  topics: queryCsvArray(queryString()),
  topic_match: queryEnum(['any', 'all'] as const),
  include_descendants: queryBoolean(),
  blocked: queryNullableBoolean(),
  crawlable: queryNullableBoolean(),
})

/**
 * Pure projection of the raw query into the generated request-contract shape. It runs the
 * pagination parser (keeping its 400 for a malformed limit or cursor) and touches no service, so
 * the route can validate the query before topic identifiers are resolved.
 */
export function prepareHostnamesSearchParams(
  query: Record<string, unknown>,
  runtimeLimits?: PaginationRuntimeLimitBounds,
) {
  const validationQuery = prepareQueryForValidation(query, {
    ...hostnamesParser.queryContract,
    ...hostnamesQueryContract.queryContract,
  })
  const pagination = hostnamesParser.parse(query, runtimeLimits)
  if (query.limit !== undefined) validationQuery.limit = pagination.limit
  if (pagination.after !== undefined) validationQuery.after = pagination.after
  return { validationQuery }
}

async function parseHostnamesSearchParamsImpl(
  query: Record<string, unknown>,
  currentUser: PrivateUser | null,
  runtimeLimits?: PaginationRuntimeLimitBounds,
) {
  const paginationOptions = hostnamesParser.parse(query, runtimeLimits)
  const canFilterModeration = currentUserCanFilterHostnameModeration(currentUser)
  const topicIdentifier = extractIdentifier(query, 'topic')
  const topicIdentifiers = extractIdentifiers(query, ['topics'], 10)
  const [resolvedTopicId, resolvedTopicIds] = await Promise.all([
    topicIdentifier ? getTopicIdByAnyCached(topicIdentifier) : Promise.resolve(undefined),
    getTopicIdsByAnyCachedBatch(topicIdentifiers),
  ])
  const shouldReturnEmpty = checkShouldReturnEmpty(
    [{ identifier: topicIdentifier, resolved: resolvedTopicId }],
    [{ identifiers: topicIdentifiers, resolved: resolvedTopicIds }],
  )
  const topicIds = resolvedTopicIds.filter((id): id is string => !!id)

  return {
    shouldReturnEmpty,
    ...paginationOptions,
    query: query.query ? stringFromUnknown(query.query) : undefined,
    hostname: query.hostname ? stringFromUnknown(query.hostname) : undefined,
    ...(resolvedTopicId ? { topic_id: resolvedTopicId } : {}),
    ...(topicIds.length > 0 ? { topic_ids: topicIds } : {}),
    ...(query.topic_match === 'all' ? { topic_match: 'all' as const } : {}),
    ...(query.include_descendants !== undefined
      ? { include_descendants: parseBooleanish(query.include_descendants) }
      : {}),
    // Non-admins always get blocked=false to exclude administratively banned domains
    blocked: canFilterModeration ? parseModerationBooleanParam(true, query.blocked) : false,
    crawlable: parseModerationBooleanParam(canFilterModeration, query.crawlable),
  }
}

export const parseHostnamesSearchParams = withQueryContract(
  parseHostnamesSearchParamsImpl,
  hostnamesParser,
  hostnamesQueryContract,
)
