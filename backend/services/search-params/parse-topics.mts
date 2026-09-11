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

async function parseTopicsSearchParamsImpl(query: Record<string, unknown>) {
  const paginationOptions = topicsParser.parse(query)

  const similarPostIdentifier = extractIdentifier(query, 'similar_post')
  const similarTopicIdentifier = extractIdentifier(query, 'similar_topic')
  const similarRssFeedItemIdentifier = extractRssFeedItemId(query, 'similar_rss_feed_item')
  const slugs = extractIdentifiers(query, ['slugs'], 100)

  const [hashtagSearch, [similarPostId, similarTopicId]] = await Promise.all([
    resolveHashtagTopicSearch(query.q),
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
    ...(query.spending_category !== undefined && {
      spending_category: parseBooleanish(query.spending_category),
    }),
    ...(query.rss_feed !== undefined && { rss_feed: parseBooleanish(query.rss_feed) }),
  }

  return {
    shouldReturnEmpty,
    searchOptions: withInternalOmitLimit(searchOptions),
  }
}

export const parseTopicsSearchParams = withQueryContract(
  parseTopicsSearchParamsImpl,
  topicsParser,
  topicsQueryContract,
)
