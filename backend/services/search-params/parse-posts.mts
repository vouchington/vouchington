import { isUUID } from '@modules/utils'
import { parseBooleanish } from '@ts-shared/utils/query'
import {
  createPaginationParser,
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryString,
  queryUuid,
  queryUuidOrUri,
  withQueryContract,
} from '@modules/pagination'
import {
  getUserIdByAnyCached,
  getPostIdByAnyCached,
  getTopicIdByAnyCached,
  getTopicIdsByAnyCachedBatch,
  getUrlIdByAnyCached,
} from '@services/entity-cache'
import {
  extractIdentifier,
  extractIdentifiers,
  extractRssFeedItemId,
  checkShouldReturnEmpty,
} from './resolve.mts'
import { resolveHashtagTopicSearch } from './hashtag-topic-search.mts'
import { withInternalOmitLimit } from './types.mts'

const postsParser = createPaginationParser({
  cursor: { type: ['simple', 'score', 'ranking'] as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    postTypes: true,
    timeRange: true,
    sort: ['new', 'best', 'hot', 'relevance', 'following_new'] as const,
    search: true,
  },
})

const postsQueryContract = defineQueryContract({
  q: queryString(),
  topic: queryString(),
  topics: queryCsvArray(queryString()),
  category: queryString(),
  categories: queryCsvArray(queryString()),
  creator: queryString(),
  url: queryUuidOrUri(),
  similar_post: queryString(),
  similar_topic: queryString(),
  review_topic: queryString(),
  data_point_topic: queryString(),
  similar_rss_feed_item: queryUuid(),
  drafts: queryBoolean(),
  data_point_vertical: queryString(),
  story_id: queryUuid(),
})

async function parsePostsSearchParamsImpl(query: Record<string, unknown>) {
  const paginationOptions = postsParser.parse(query)
  const hashtagSearch = await resolveHashtagTopicSearch(query.q)

  const creatorIdentifier = extractIdentifier(query, 'creator')
  const urlIdentifier = extractIdentifier(query, 'url')
  const similarPostIdentifier = extractIdentifier(query, 'similar_post')
  const similarTopicIdentifier = extractIdentifier(query, 'similar_topic')
  const reviewTopicIdentifier = extractIdentifier(query, 'review_topic')
  const dataPointTopicIdentifier = extractIdentifier(query, 'data_point_topic')
  const similarRssFeedItemIdentifier = extractRssFeedItemId(query, 'similar_rss_feed_item')
  // `topics` = universal (tagged OR reviewed OR data-pointed)
  const uniqueTopicIdentifiers = extractIdentifiers(query, ['topic', 'topics'], 10)
  // `categories` = tag-based only (relation__post__category__topic)
  const uniqueCategoryIdentifiers = extractIdentifiers(query, ['category', 'categories'], 10)

  const [
    creatorId,
    urlId,
    similarPostId,
    similarTopicId,
    reviewTopicId,
    dataPointTopicId,
    resolvedTopicIds,
    resolvedCategoryIds,
  ] = await Promise.all([
    creatorIdentifier ? getUserIdByAnyCached(creatorIdentifier) : Promise.resolve(undefined),
    urlIdentifier ? getUrlIdByAnyCached(urlIdentifier) : Promise.resolve(undefined),
    similarPostIdentifier
      ? getPostIdByAnyCached(similarPostIdentifier)
      : Promise.resolve(undefined),
    similarTopicIdentifier
      ? getTopicIdByAnyCached(similarTopicIdentifier)
      : Promise.resolve(undefined),
    reviewTopicIdentifier
      ? getTopicIdByAnyCached(reviewTopicIdentifier)
      : Promise.resolve(undefined),
    dataPointTopicIdentifier
      ? getTopicIdByAnyCached(dataPointTopicIdentifier)
      : Promise.resolve(undefined),
    getTopicIdsByAnyCachedBatch(uniqueTopicIdentifiers),
    getTopicIdsByAnyCachedBatch(uniqueCategoryIdentifiers),
  ])

  const storyIdRaw = typeof query.story_id === 'string' ? query.story_id : undefined
  const storyId = storyIdRaw !== undefined && isUUID(storyIdRaw) ? storyIdRaw : undefined

  const shouldReturnEmpty =
    checkShouldReturnEmpty(
      [
        { identifier: creatorIdentifier, resolved: creatorId },
        { identifier: urlIdentifier, resolved: urlId },
        { identifier: similarPostIdentifier, resolved: similarPostId },
        { identifier: similarTopicIdentifier, resolved: similarTopicId },
        { identifier: reviewTopicIdentifier, resolved: reviewTopicId },
        { identifier: dataPointTopicIdentifier, resolved: dataPointTopicId },
      ],
      [
        { identifiers: uniqueTopicIdentifiers, resolved: resolvedTopicIds },
        { identifiers: uniqueCategoryIdentifiers, resolved: resolvedCategoryIds },
      ],
    ) ||
    (storyIdRaw !== undefined && storyId === undefined) ||
    hashtagSearch.hasUnknown

  const universalTopicIds = [...new Set(resolvedTopicIds.filter((id): id is string => id !== null))]
  const relatedTopicIds = [
    ...new Set(resolvedCategoryIds.filter((id): id is string => id !== null)),
  ]

  const searchOptions = {
    ...paginationOptions,
    // Map `q` shorthand to `text_search_query` (consistent with parse-topics and parse-rss-feeds)
    ...(query.q && !paginationOptions.text_search_query && hashtagSearch.textSearchQuery
      ? { text_search_query: hashtagSearch.textSearchQuery }
      : {}),
    ...(urlId && { url_id: urlId }),
    ...(creatorId && { user_id: creatorId }),
    ...(similarPostId && { similar_post_id: similarPostId }),
    ...(similarTopicId && { similar_topic_id: similarTopicId }),
    ...(reviewTopicId && { review_topic_ids: [reviewTopicId] }),
    ...(dataPointTopicId && { data_point_topic_ids: [dataPointTopicId] }),
    ...(similarRssFeedItemIdentifier && {
      similar_rss_feed_item_id: similarRssFeedItemIdentifier,
    }),
    ...(universalTopicIds.length > 0 && { universal_topic_ids: universalTopicIds }),
    ...(relatedTopicIds.length > 0 && { related_topic_ids: relatedTopicIds }),
    ...(hashtagSearch.topicIds.length > 0 && { hashtag_topic_ids: hashtagSearch.topicIds }),
    ...(hashtagSearch.filters.some(filter => filter.kind === 'exact_alias') && {
      hashtag_alias_ids: hashtagSearch.filters.flatMap(filter =>
        filter.kind === 'exact_alias' ? [filter.aliasId] : [],
      ),
    }),
    ...(query.drafts !== undefined && { drafts: parseBooleanish(query.drafts) }),
    ...(typeof query.data_point_vertical === 'string' && query.data_point_vertical.trim()
      ? { data_point_vertical: query.data_point_vertical.trim() }
      : {}),
    ...(storyId && { story_id: storyId }),
  }

  return {
    shouldReturnEmpty,
    searchOptions: withInternalOmitLimit(searchOptions),
  }
}

export const parsePostsSearchParams = withQueryContract(
  parsePostsSearchParamsImpl,
  postsParser,
  postsQueryContract,
)
