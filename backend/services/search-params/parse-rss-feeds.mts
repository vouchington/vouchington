import { parseBooleanish } from '@ts-shared/utils/query'
import {
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryEnum,
  queryNullableBoolean,
  queryString,
  withQueryContract,
} from '@modules/pagination'
import type { ResolvedSearchParams } from './types.mts'
import { getTopicIdByAnyCached, getTopicIdsByAnyCachedBatch } from '@services/entity-cache'
import { extractIdentifier, extractIdentifiers, checkShouldReturnEmpty } from './resolve.mts'
import { resolveHashtagTopicSearch } from './hashtag-topic-search.mts'

export const VALID_FEED_TYPES = ['article', 'podcast', 'video', 'mixed'] as const

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
}

type ParseRssFeedsSearchParamsDeps = {
  getTopicIdByAnyCached: typeof getTopicIdByAnyCached
  getTopicIdsByAnyCachedBatch: typeof getTopicIdsByAnyCachedBatch
  resolveHashtagTopicSearch: typeof resolveHashtagTopicSearch
}

type FeedType = (typeof VALID_FEED_TYPES)[number]

const defaultDeps: ParseRssFeedsSearchParamsDeps = {
  getTopicIdByAnyCached,
  getTopicIdsByAnyCachedBatch,
  resolveHashtagTopicSearch,
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
})

async function parseRssFeedsSearchParamsImpl(
  query: Record<string, unknown>,
  deps: Partial<ParseRssFeedsSearchParamsDeps> = {},
): Promise<ResolvedSearchParams<RssFeedsSearchOptions>> {
  const resolvedDeps = { ...defaultDeps, ...deps }
  if (typeof query.feed_type === 'string' && !isFeedType(query.feed_type)) {
    return { shouldReturnEmpty: true, searchOptions: {} }
  }

  const topicIdentifier = extractIdentifier(query, 'topic')
  const topicIdentifiers = extractIdentifiers(query, ['topics'], 10)
  const publisherTypeIdentifier = extractIdentifier(query, 'publisher_type')
  const publisherTypeIdentifiers = extractIdentifiers(query, ['publisher_types'], 10)
  const categoryIdentifier = extractIdentifier(query, 'category')

  const [
    hashtagSearch,
    resolvedTopicId,
    resolvedTopicIds,
    resolvedPublisherTypeId,
    resolvedPublisherTypeIds,
    resolvedCategoryTopicId,
  ] = await Promise.all([
    resolvedDeps.resolveHashtagTopicSearch(query.q),
    topicIdentifier
      ? resolvedDeps.getTopicIdByAnyCached(topicIdentifier)
      : Promise.resolve(undefined),
    resolvedDeps.getTopicIdsByAnyCachedBatch(topicIdentifiers),
    publisherTypeIdentifier
      ? resolvedDeps.getTopicIdByAnyCached(publisherTypeIdentifier)
      : Promise.resolve(undefined),
    resolvedDeps.getTopicIdsByAnyCachedBatch(publisherTypeIdentifiers),
    categoryIdentifier
      ? resolvedDeps.getTopicIdByAnyCached(categoryIdentifier)
      : Promise.resolve(undefined),
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
    // Feeds themselves only have a topic_id. An unlinked alias can match feed
    // items, but cannot match a feed, so it is a valid empty filter here.
    hashtagSearch.filters.some(filter => filter.kind === 'exact_alias')

  const enabledParam = query.enabled
  const enabled =
    typeof enabledParam === 'string' && enabledParam.toLowerCase() === 'null'
      ? null
      : enabledParam === undefined
        ? undefined
        : parseBooleanish(enabledParam)
  const discoverableParam = query.discoverable
  const discoverable =
    typeof discoverableParam === 'string' && discoverableParam.toLowerCase() === 'null'
      ? null
      : discoverableParam === undefined
        ? undefined
        : parseBooleanish(discoverableParam)

  const topicIds = [...new Set(resolvedTopicIds.filter((id): id is string => !!id))]

  const textSearchQuery = hashtagSearch.textSearchQuery

  const searchOptions: RssFeedsSearchOptions = {
    ...(resolvedTopicId ? { topic_id: resolvedTopicId } : {}),
    ...(topicIds.length > 0 ? { topic_ids: topicIds } : {}),
    ...(hashtagSearch.topicIds.length > 0 ? { hashtag_topic_ids: hashtagSearch.topicIds } : {}),
    ...(query.topic_match === 'all' ? { topic_match: 'all' as const } : {}),
    ...(query.include_descendants !== undefined
      ? { include_descendants: parseBooleanish(query.include_descendants) }
      : {}),
    ...(resolvedPublisherTypeId ? { publisher_type_id: resolvedPublisherTypeId } : {}),
    ...(resolvedPublisherTypeIds.filter((id): id is string => !!id).length > 0
      ? { publisher_type_ids: resolvedPublisherTypeIds.filter((id): id is string => !!id) }
      : {}),
    ...(query.publisher_type_match === 'all' ? { publisher_type_match: 'all' as const } : {}),
    ...(query.text_search_query
      ? { text_search_query: String(query.text_search_query) }
      : textSearchQuery
        ? { text_search_query: textSearchQuery }
        : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(discoverable !== undefined ? { discoverable } : {}),
    ...(isFeedType(query.feed_type) ? { feed_type: query.feed_type } : {}),
    ...(resolvedCategoryTopicId ? { category_topic_id: resolvedCategoryTopicId } : {}),
  }

  return { shouldReturnEmpty, searchOptions }
}

export const parseRssFeedsSearchParams = withQueryContract(
  parseRssFeedsSearchParamsImpl,
  rssFeedsQueryContract,
)

function isFeedType(value: unknown): value is FeedType {
  return VALID_FEED_TYPES.some(feedType => feedType === value)
}
