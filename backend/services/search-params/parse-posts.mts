import { postDataPointFilters } from './post-data-point-filters.mts'
import { postRecommendationFilters, isRecommendationOnly } from './post-recommendation-filters.mts'
import { isUUID } from '@modules/utils'
import { parseBooleanish } from '@ts-shared/utils/query'
import { withQueryContract } from '@vouchington/pagination'
import { validatePostTypes, type PaginationRuntimeLimitBounds } from '@modules/pagination'
import { VALID_SEARCH_POST_TYPES } from '@ts-shared/feed-capabilities'
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
import {
  resolveHashtagTopicSearch,
  validateTopicSearchTerms,
  MAX_TOPIC_SEARCH_TERMS,
} from './hashtag-topic-search.mts'
import { postsParser, postsQueryContract } from './parse-posts-contract.mts'
import { prepareQueryForValidation } from './prepare-query.mts'
import { withInternalOmitLimit } from './types.mts'
export function preparePostsSearchParams(
  query: Record<string, unknown>,
  runtimeLimits?: PaginationRuntimeLimitBounds,
) {
  const postTypes = validatePostTypes(query.post_types, VALID_SEARCH_POST_TYPES)
  const literalQuery = isRecommendationOnly(postTypes)
  validateTopicSearchTerms(query, ['topic', 'topics'], !literalQuery)
  validateTopicSearchTerms(query, ['category', 'categories'])
  const validationQuery = prepareQueryForValidation(query, {
    ...postsParser.queryContract,
    ...postsQueryContract.queryContract,
  })
  const pagination = postsParser.parse(query, runtimeLimits)
  if (query.limit !== undefined) validationQuery.limit = pagination.limit
  return {
    validationQuery,
    paginationOptions: pagination,
    postTypes,
    creatorIdentifier: extractIdentifier(query, 'creator'),
    communityIdRaw: typeof query.community_id === 'string' ? query.community_id : undefined,
    trendingMinScore: query.trending_min_score,
    urlIdentifier: extractIdentifier(query, 'url'),
    similarPostIdentifier: extractIdentifier(query, 'similar_post'),
    similarTopicIdentifier: extractIdentifier(query, 'similar_topic'),
    reviewTopicIdentifier: extractIdentifier(query, 'review_topic'),
    dataPointTopicIdentifier: extractIdentifier(query, 'data_point_topic'),
    similarRssFeedItemIdentifier: extractRssFeedItemId(query, 'similar_rss_feed_item'),
    uniqueTopicIdentifiers: extractIdentifiers(query, ['topic', 'topics'], MAX_TOPIC_SEARCH_TERMS),
    uniqueCategoryIdentifiers: extractIdentifiers(
      query,
      ['category', 'categories'],
      MAX_TOPIC_SEARCH_TERMS,
    ),
    storyIdRaw: typeof query.story_id === 'string' ? query.story_id : undefined,
    drafts: query.drafts,
    hasHackerNewsReferences: query.has_hacker_news_references,
    dataPointVertical: query.data_point_vertical,
    topicRecommendationStatus: query.topic_recommendation_status,
    dataPointResult: query.data_point_result,
    dataPointCreditScoreRange: query.data_point_credit_score_range,
    q: query.q,
  }
}
export async function resolvePostsSearchParams(
  prepared: ReturnType<typeof preparePostsSearchParams>,
) {
  const {
    paginationOptions,
    postTypes,
    creatorIdentifier,
    communityIdRaw,
    trendingMinScore,
    urlIdentifier,
    similarPostIdentifier,
    similarTopicIdentifier,
    reviewTopicIdentifier,
    dataPointTopicIdentifier,
    similarRssFeedItemIdentifier,
    uniqueTopicIdentifiers,
    uniqueCategoryIdentifiers,
    storyIdRaw,
    drafts,
    hasHackerNewsReferences,
    dataPointVertical,
    topicRecommendationStatus,
    dataPointResult,
    dataPointCreditScoreRange,
    q,
  } = prepared
  const hashtagSearch = await resolveHashtagTopicSearch(
    isRecommendationOnly(postTypes) ? undefined : q,
    { maxMentions: MAX_TOPIC_SEARCH_TERMS, limitStatus: 400 },
  )
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
    (communityIdRaw !== undefined && !isUUID(communityIdRaw)) ||
    hashtagSearch.hasUnknown
  const universalTopicIds = [
    ...new Set([
      ...resolvedTopicIds.filter((id): id is string => id !== null),
      ...hashtagSearch.topicIds,
    ]),
  ]
  const relatedIds = [...new Set(resolvedCategoryIds.filter((id): id is string => id !== null))]
  const searchOptions = {
    ...paginationOptions,
    ...(postTypes && { post_types: postTypes }),
    ...(q && !paginationOptions.text_search_query && hashtagSearch.textSearchQuery
      ? { text_search_query: hashtagSearch.textSearchQuery }
      : {}),
    ...postRecommendationFilters(postTypes, q, topicRecommendationStatus),
    ...(urlId && { url_id: urlId }),
    ...(creatorId && { user_id: creatorId }),
    ...(communityIdRaw && isUUID(communityIdRaw) && { community_id: communityIdRaw }),
    ...(trendingMinScore !== undefined && { trending_min_score: Number(trendingMinScore) }),
    ...(similarPostId && { similar_post_id: similarPostId }),
    ...(similarTopicId && { similar_topic_id: similarTopicId }),
    ...(reviewTopicId && { review_topic_ids: [reviewTopicId] }),
    ...(dataPointTopicId && { data_point_topic_ids: [dataPointTopicId] }),
    ...(similarRssFeedItemIdentifier && {
      similar_rss_feed_item_id: similarRssFeedItemIdentifier,
    }),
    ...(universalTopicIds.length > 0 && { universal_topic_ids: universalTopicIds }),
    ...(relatedIds.length > 0 && { related_topic_ids: relatedIds }),
    ...(hashtagSearch.filters.some(filter => filter.kind === 'exact_alias') && {
      hashtag_alias_ids: hashtagSearch.filters.flatMap(filter =>
        filter.kind === 'exact_alias' ? [filter.aliasId] : [],
      ),
    }),
    ...(drafts !== undefined && { drafts: parseBooleanish(drafts) }),
    ...(hasHackerNewsReferences !== undefined && {
      has_hacker_news_references: parseBooleanish(hasHackerNewsReferences),
    }),
    ...(typeof dataPointVertical === 'string' && dataPointVertical.trim()
      ? { data_point_vertical: dataPointVertical.trim() }
      : {}),
    ...postDataPointFilters(dataPointResult, dataPointCreditScoreRange),
    ...(storyId && { story_id: storyId }),
  }
  return {
    shouldReturnEmpty,
    searchOptions: withInternalOmitLimit(searchOptions),
  }
}
export const parsePostsSearchParams = withQueryContract(
  async (query: Record<string, unknown>, runtimeLimits?: PaginationRuntimeLimitBounds) =>
    resolvePostsSearchParams(preparePostsSearchParams(query, runtimeLimits)),
  postsParser,
  postsQueryContract,
)
