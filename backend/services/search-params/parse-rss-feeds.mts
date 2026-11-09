import { parseBooleanish } from '@ts-shared/utils/query'
import {
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryEnum,
  queryNullableBoolean,
  queryString,
  withQueryContract,
} from '@vouchington/pagination'
import type { ResolvedSearchParams } from './types.mts'
import { getTopicIdByAnyCached, getTopicIdsByAnyCachedBatch } from '@services/entity-cache'
import { extractIdentifier, extractIdentifiers, checkShouldReturnEmpty } from './resolve.mts'
import {
  resolveHashtagTopicSearch,
  validateTopicSearchTerms,
  MAX_TOPIC_SEARCH_TERMS,
} from './hashtag-topic-search.mts'
import { prepareQueryForValidation } from './prepare-query.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import {
  RSS_FEED_SORTS,
  RSS_FEED_TIME_RANGES,
  resolveTrendingOptions,
} from './rss-feeds-trending.mts'
export const VALID_FEED_TYPES = ['article', 'podcast', 'video', 'mixed'] as const
export { RSS_FEED_SORTS, RSS_FEED_TIME_RANGES }

type RssFeedsSearchOptions = {
  topic_id?: string
  topic_ids?: string[]
  hashtag_topic_ids?: string[]
  topic_match?: 'any' | 'all'
  include_descendants?: boolean
  publisher_type_id?: string
  publisher_type_ids?: string[]
  publisher_type_match?: 'any' | 'all'
  text_search_query?: string
  enabled?: boolean | null
  discoverable?: boolean | null
  feed_type?: (typeof VALID_FEED_TYPES)[number]
  category_topic_id?: string
  sort?: (typeof RSS_FEED_SORTS)[number]
  time_range?: (typeof RSS_FEED_TIME_RANGES)[number]
}

const rssFeedsQueryContract = defineQueryContract({
  q: queryString(),
  text_search_query: queryString(),
  topic: queryString(),
  topics: queryCsvArray(queryString()),
  topic_match: queryEnum(['any', 'all'] as const),
  include_descendants: queryBoolean(),
  publisher_type: queryString(),
  publisher_types: queryCsvArray(queryString()),
  publisher_type_match: queryEnum(['any', 'all'] as const),
  enabled: queryNullableBoolean(),
  discoverable: queryNullableBoolean(),
  feed_type: queryEnum(VALID_FEED_TYPES),
  category: queryString(),
  sort: queryEnum(RSS_FEED_SORTS),
  time_range: queryEnum(RSS_FEED_TIME_RANGES),
})

export function prepareRssFeedsSearchParams(query: Record<string, unknown>) {
  validateTopicSearchTerms(query, ['topic', 'topics'], true)
  return {
    validationQuery: prepareQueryForValidation(query, rssFeedsQueryContract.queryContract),
    feedType: query.feed_type,
    topicIdentifier: extractIdentifier(query, 'topic'),
    topicIdentifiers: extractIdentifiers(query, ['topics'], MAX_TOPIC_SEARCH_TERMS),
    publisherTypeIdentifier: extractIdentifier(query, 'publisher_type'),
    publisherTypeIdentifiers: extractIdentifiers(query, ['publisher_types'], 10),
    categoryIdentifier: extractIdentifier(query, 'category'),
    q: query.q,
    topicMatch: query.topic_match,
    includeDescendants: query.include_descendants,
    publisherTypeMatch: query.publisher_type_match,
    textSearchQuery: query.text_search_query,
    enabled: query.enabled,
    discoverable: query.discoverable,
    sort: query.sort,
    timeRange: query.time_range,
  }
}

export async function resolveRssFeedsSearchParams(
  prepared: ReturnType<typeof prepareRssFeedsSearchParams>,
): Promise<ResolvedSearchParams<RssFeedsSearchOptions>> {
  const {
    feedType,
    topicIdentifier,
    topicIdentifiers,
    publisherTypeIdentifier,
    publisherTypeIdentifiers,
    categoryIdentifier,
    q,
    topicMatch,
    includeDescendants,
    publisherTypeMatch,
    textSearchQuery: requestedTextSearchQuery,
    enabled: enabledParam,
    discoverable: discoverableParam,
  } = prepared
  if (typeof feedType === 'string' && !isFeedType(feedType)) {
    return { shouldReturnEmpty: true, searchOptions: {} }
  }
  const trendingOptions = resolveTrendingOptions(prepared)

  const [
    hashtagSearch,
    resolvedTopicId,
    resolvedTopicIds,
    resolvedPublisherTypeId,
    resolvedPublisherTypeIds,
    resolvedCategoryTopicId,
  ] = await Promise.all([
    resolveHashtagTopicSearch(q),
    topicIdentifier ? getTopicIdByAnyCached(topicIdentifier) : Promise.resolve(undefined),
    getTopicIdsByAnyCachedBatch(topicIdentifiers),
    publisherTypeIdentifier
      ? getTopicIdByAnyCached(publisherTypeIdentifier)
      : Promise.resolve(undefined),
    getTopicIdsByAnyCachedBatch(publisherTypeIdentifiers),
    categoryIdentifier ? getTopicIdByAnyCached(categoryIdentifier) : Promise.resolve(undefined),
  ])

  const shouldReturnEmpty =
    checkShouldReturnEmpty(
      [
        { identifier: topicIdentifier, resolved: resolvedTopicId },
        { identifier: publisherTypeIdentifier, resolved: resolvedPublisherTypeId },
        { identifier: categoryIdentifier, resolved: resolvedCategoryTopicId },
      ],
      [
        { identifiers: topicIdentifiers, resolved: resolvedTopicIds },
        { identifiers: publisherTypeIdentifiers, resolved: resolvedPublisherTypeIds },
      ],
    ) ||
    hashtagSearch.hasUnknown ||
    hashtagSearch.filters.some(filter => filter.kind === 'exact_alias')

  const enabled =
    typeof enabledParam === 'string' && enabledParam.toLowerCase() === 'null'
      ? null
      : enabledParam === undefined
        ? undefined
        : parseBooleanish(enabledParam)
  const discoverable =
    typeof discoverableParam === 'string' && discoverableParam.toLowerCase() === 'null'
      ? null
      : discoverableParam === undefined
        ? undefined
        : parseBooleanish(discoverableParam)

  const topicIds = [...new Set(resolvedTopicIds.filter((id): id is string => !!id))]
  const publisherTypeIds = resolvedPublisherTypeIds.filter((id): id is string => !!id)
  const textSearchQuery = hashtagSearch.textSearchQuery

  const searchOptions: RssFeedsSearchOptions = {
    ...(resolvedTopicId ? { topic_id: resolvedTopicId } : {}),
    ...(topicIds.length > 0 ? { topic_ids: topicIds } : {}),
    ...(hashtagSearch.topicIds.length > 0 ? { hashtag_topic_ids: hashtagSearch.topicIds } : {}),
    ...(topicMatch === 'all' ? { topic_match: 'all' as const } : {}),
    ...(includeDescendants !== undefined
      ? { include_descendants: parseBooleanish(includeDescendants) }
      : {}),
    ...(resolvedPublisherTypeId ? { publisher_type_id: resolvedPublisherTypeId } : {}),
    ...(publisherTypeIds.length > 0 ? { publisher_type_ids: publisherTypeIds } : {}),
    ...(publisherTypeMatch === 'all' ? { publisher_type_match: 'all' as const } : {}),
    ...(requestedTextSearchQuery
      ? { text_search_query: stringFromUnknown(requestedTextSearchQuery) }
      : textSearchQuery
        ? { text_search_query: textSearchQuery }
        : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(discoverable !== undefined ? { discoverable } : {}),
    ...(isFeedType(feedType) ? { feed_type: feedType } : {}),
    ...(resolvedCategoryTopicId ? { category_topic_id: resolvedCategoryTopicId } : {}),
    ...trendingOptions,
  }

  return { shouldReturnEmpty, searchOptions }
}

async function parseRssFeedsSearchParamsImpl(query: Record<string, unknown>) {
  return resolveRssFeedsSearchParams(prepareRssFeedsSearchParams(query))
}

export const parseRssFeedsSearchParams = withQueryContract(
  parseRssFeedsSearchParamsImpl,
  rssFeedsQueryContract,
)

function isFeedType(value: unknown): value is (typeof VALID_FEED_TYPES)[number] {
  return VALID_FEED_TYPES.some(feedType => feedType === value)
}
