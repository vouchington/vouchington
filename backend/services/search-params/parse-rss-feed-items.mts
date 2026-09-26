import {
  createPaginationParser,
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryEnum,
  queryInteger,
  queryString,
  queryUuid,
  withQueryContract,
} from '@modules/pagination'
import { VALID_MEDIA_TYPES } from '@modules/pagination/filters'
import { isUUID } from '@modules/utils'
import { getTopicIdsByAnyCachedBatch, resolveRssFeedIds } from '@services/entity-cache'
import { extractIdentifiers, checkShouldReturnEmpty } from './resolve.mts'
import { resolveHashtagTopicSearch } from './hashtag-topic-search.mts'
import { prepareQueryForValidation } from './prepare-query.mts'

const rssFeedItemsParser = createPaginationParser({
  cursor: { type: 'timestamp' as const },
  limit: { min: 1, max: 100, default: 10 },
  filters: {
    search: true,
    mediaTypes: true,
  },
})

const rssFeedItemsQueryContract = defineQueryContract({
  q: queryString(),
  rss_feed: queryUuid(),
  rss_feeds: queryCsvArray(queryUuid()),
  topic: queryString(),
  topics: queryCsvArray(queryString()),
  category_topic: queryString(),
  category_topics: queryCsvArray(queryString()),
  similar_window_days: queryInteger({ minimum: 0, maximum: 365 }),
  has_related_posts: queryBoolean(),
  story_id: queryUuid(),
  read: queryBoolean(),
})

const rssFeedItemsValidationQueryContract = defineQueryContract({
  ...rssFeedItemsParser.queryContract,
  ...rssFeedItemsQueryContract.queryContract,
  media_type: queryCsvArray(queryEnum(VALID_MEDIA_TYPES)),
})

export function prepareRssFeedItemsSearchParams(query: Record<string, unknown>) {
  const validationQuery = prepareQueryForValidation(
    query,
    rssFeedItemsValidationQueryContract.queryContract,
    ['similar_window_days'],
  )
  const rawSimilarWindowDays = query.similar_window_days
  if (rawSimilarWindowDays !== undefined) {
    const similarWindowDays = Number(rawSimilarWindowDays)
    if (!Number.isInteger(similarWindowDays)) {
      validationQuery.similar_window_days = rawSimilarWindowDays
    } else if (similarWindowDays >= 0 && similarWindowDays <= 365) {
      validationQuery.similar_window_days = similarWindowDays
    }
  }
  const pagination = rssFeedItemsParser.parse(query)
  if (query.limit !== undefined) validationQuery.limit = pagination.limit
  return {
    validationQuery,
    paginationOptions: pagination,
    q: query.q,
    uniqueTopicIdentifiers: extractIdentifiers(query, ['topic', 'topics'], 10),
    uniqueCategoryTopicIdentifiers: extractIdentifiers(
      query,
      ['category_topic', 'category_topics'],
      10,
    ),
    rssFeedIds: resolveRssFeedIds(extractIdentifiers(query, ['rss_feed', 'rss_feeds'], 10)),
    storyIdRaw: typeof query.story_id === 'string' ? query.story_id : undefined,
    similarWindowDays: rawSimilarWindowDays,
    hasRelatedPosts: query.has_related_posts,
    read: query.read,
  }
}

export async function resolveRssFeedItemsSearchParams(
  prepared: ReturnType<typeof prepareRssFeedItemsSearchParams>,
) {
  const {
    paginationOptions,
    q,
    uniqueTopicIdentifiers,
    uniqueCategoryTopicIdentifiers,
    rssFeedIds: rss_feed_ids,
    storyIdRaw,
    similarWindowDays,
    hasRelatedPosts,
    read: rawRead,
  } = prepared

  // When semantic_search_query is present, skip q hashtag resolution entirely:
  // - unresolved hashtags in q must not 400 (semantic wins)
  // - resolved hashtags must not add spurious topic filters to the semantic path
  const hasSemanticSearch = Boolean(paginationOptions.semantic_search_query?.trim())
  const hashtagSearch = hasSemanticSearch
    ? {
        filters: [],
        hasUnknown: false,
        textSearchQuery: undefined as string | undefined,
        topicIds: [] as string[],
      }
    : await resolveHashtagTopicSearch(q)

  const [topicIdsByIdentifier, categoryTopicIdsByIdentifier] = await Promise.all([
    getTopicIdsByAnyCachedBatch(uniqueTopicIdentifiers),
    getTopicIdsByAnyCachedBatch(uniqueCategoryTopicIdentifiers),
  ])

  const storyId = storyIdRaw !== undefined && isUUID(storyIdRaw) ? storyIdRaw : undefined

  const shouldReturnEmpty =
    checkShouldReturnEmpty(
      [],
      [
        { identifiers: uniqueTopicIdentifiers, resolved: topicIdsByIdentifier },
        { identifiers: uniqueCategoryTopicIdentifiers, resolved: categoryTopicIdsByIdentifier },
      ],
    ) ||
    (storyIdRaw !== undefined && storyId === undefined) ||
    hashtagSearch.hasUnknown

  const topic_ids = [...new Set(topicIdsByIdentifier.filter((id): id is string => Boolean(id)))]
  const hashtag_topic_ids = hashtagSearch.topicIds
  const category_topic_ids = [
    ...new Set(categoryTopicIdsByIdentifier.filter((id): id is string => Boolean(id))),
  ]

  const rawDays = similarWindowDays !== undefined ? Number(similarWindowDays) : undefined
  const similar_window_days =
    rawDays !== undefined && Number.isInteger(rawDays) && rawDays >= 0 && rawDays <= 365
      ? rawDays
      : undefined

  const has_related_posts =
    hasRelatedPosts === 'true' ? true : hasRelatedPosts === 'false' ? false : undefined

  const read = rawRead === 'true' ? true : rawRead === 'false' ? false : undefined

  const searchOptions = {
    ...paginationOptions,
    // When semantic_search_query is present it wins over the text-derived query so
    // that the embedding-ranked path does not mix with tsvector ranking.
    ...(q &&
    !paginationOptions.text_search_query &&
    !paginationOptions.semantic_search_query &&
    hashtagSearch.textSearchQuery
      ? { text_search_query: hashtagSearch.textSearchQuery }
      : {}),
    ...(rss_feed_ids.length > 0 && { rss_feed_ids }),
    ...(topic_ids.length > 0 && { topic_ids }),
    ...(category_topic_ids.length > 0 && { category_topic_ids }),
    ...(hashtag_topic_ids.length > 0 && { hashtag_topic_ids }),
    ...(hashtagSearch.filters.some(filter => filter.kind === 'exact_alias') && {
      hashtag_alias_ids: hashtagSearch.filters.flatMap(filter =>
        filter.kind === 'exact_alias' ? [filter.aliasId] : [],
      ),
    }),
    ...(similar_window_days !== undefined && { similar_window_days }),
    ...(has_related_posts !== undefined && { has_related_posts }),
    ...(storyId && { story_id: storyId }),
    ...(read !== undefined && { read }),
  }

  return { shouldReturnEmpty, searchOptions }
}

async function parseRssFeedItemsSearchParamsImpl(query: Record<string, unknown>) {
  return await resolveRssFeedItemsSearchParams(prepareRssFeedItemsSearchParams(query))
}

export const parseRssFeedItemsSearchParams = withQueryContract(
  parseRssFeedItemsSearchParamsImpl,
  rssFeedItemsValidationQueryContract,
)
