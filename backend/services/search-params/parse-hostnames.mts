import { parseBooleanish } from '@ts-shared/utils/query'
import {
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

async function parseHostnamesSearchParamsImpl(
  query: Record<string, unknown>,
  currentUser: PrivateUser | null,
) {
  const paginationOptions = hostnamesParser.parse(query)
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

  return {
    shouldReturnEmpty,
    ...paginationOptions,
    query: query.query ? String(query.query) : undefined,
    hostname: query.hostname ? String(query.hostname) : undefined,
    ...(resolvedTopicId ? { topic_id: resolvedTopicId } : {}),
    ...(resolvedTopicIds.filter((id): id is string => !!id).length > 0
      ? { topic_ids: resolvedTopicIds.filter((id): id is string => !!id) }
      : {}),
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
