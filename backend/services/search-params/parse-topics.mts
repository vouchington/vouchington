import { parseBooleanish } from '@ts-shared/utils/query'
import {
  createPaginationParser,
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryString,
  queryUuid,
  withQueryContract,
} from '@modules/pagination'
import { getPostIdByAnyCached, getTopicIdByAnyCached } from '@services/entity-cache'
import {
  extractIdentifier,
  extractIdentifiers,
  extractRssFeedItemId,
  checkShouldReturnEmpty,
} from './resolve.mts'
import { resolveHashtagTopicSearch } from './hashtag-topic-search.mts'
import { prepareQueryForValidation } from './prepare-query.mts'
import { withInternalOmitLimit } from './types.mts'

const topicsParser = createPaginationParser({
  cursor: { type: ['simple', 'score', 'ranking', 'tier'] as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    topicTypes: true,
    sort: ['new', 'best', 'relevance'] as const,
    search: true,
  },
})

const topicsQueryContract = defineQueryContract({
  q: queryString(),
  similar_post: queryString(),
  similar_topic: queryString(),
  similar_rss_feed_item: queryUuid(),
  slugs: queryCsvArray(queryString()),
  spending_category: queryBoolean(),
  rss_feed: queryBoolean(),
})

export function prepareTopicsSearchParams(query: Record<string, unknown>) {
  const validationQuery = prepareQueryForValidation(query, {
    ...topicsParser.queryContract,
    ...topicsQueryContract.queryContract,
  })
  const pagination = topicsParser.parse(query)
  if (query.limit !== undefined) validationQuery.limit = pagination.limit
  return {
    validationQuery,
    paginationOptions: pagination,
    similarPostIdentifier: extractIdentifier(query, 'similar_post'),
    similarTopicIdentifier: extractIdentifier(query, 'similar_topic'),
    similarRssFeedItemIdentifier: extractRssFeedItemId(query, 'similar_rss_feed_item'),
    slugs: extractIdentifiers(query, ['slugs'], 100),
    spendingCategory: query.spending_category,
    rssFeed: query.rss_feed,
    q: query.q,
  }
}

export async function resolveTopicsSearchParams(
  prepared: ReturnType<typeof prepareTopicsSearchParams>,
) {
  const {
    paginationOptions,
    similarPostIdentifier,
    similarTopicIdentifier,
    similarRssFeedItemIdentifier,
    slugs,
    spendingCategory,
    rssFeed,
    q,
  } = prepared

  const [hashtagSearch, [similarPostId, similarTopicId]] = await Promise.all([
    resolveHashtagTopicSearch(q),
    Promise.all([
      similarPostIdentifier
        ? getPostIdByAnyCached(similarPostIdentifier)
        : Promise.resolve(undefined),
      similarTopicIdentifier
        ? getTopicIdByAnyCached(similarTopicIdentifier)
        : Promise.resolve(undefined),
    ]),
  ])

  const shouldReturnEmpty =
    checkShouldReturnEmpty(
      [
        { identifier: similarPostIdentifier, resolved: similarPostId },
        { identifier: similarTopicIdentifier, resolved: similarTopicId },
      ],
      [],
    ) ||
    hashtagSearch.hasUnknown ||
    hashtagSearch.filters.some(filter => filter.kind === 'exact_alias')

  const searchOptions = {
    ...paginationOptions,
    ...(hashtagSearch.textSearchQuery && !paginationOptions.text_search_query
      ? { text_search_query: hashtagSearch.textSearchQuery }
      : {}),
    ...(hashtagSearch.topicIds.length > 0 && { hashtag_topic_ids: hashtagSearch.topicIds }),
    ...(similarPostId && { similar_post_id: similarPostId }),
    ...(similarTopicId && { similar_topic_id: similarTopicId }),
    ...(similarRssFeedItemIdentifier && {
      similar_rss_feed_item_id: similarRssFeedItemIdentifier,
    }),
    ...(slugs.length > 0 && { slugs }),
    ...(spendingCategory !== undefined && {
      spending_category: parseBooleanish(spendingCategory),
    }),
    ...(rssFeed !== undefined && { rss_feed: parseBooleanish(rssFeed) }),
  }

  return {
    shouldReturnEmpty,
    searchOptions: withInternalOmitLimit(searchOptions),
  }
}

async function parseTopicsSearchParamsImpl(query: Record<string, unknown>) {
  return await resolveTopicsSearchParams(prepareTopicsSearchParams(query))
}

export const parseTopicsSearchParams = withQueryContract(
  parseTopicsSearchParamsImpl,
  topicsParser,
  topicsQueryContract,
)
