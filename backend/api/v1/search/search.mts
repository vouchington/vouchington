import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import { clampAnonLimit, clampLimit } from '@services/pagination'
import app from '../../app.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../api-query-contract.mts'
import { defineQueryContract, queryInteger, queryString } from '@vouchington/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { searchOmnisearch } from '@services/search'
import { resolveHashtagTopicSearch } from '@services/search-params'
import { detectSearchSort, hasTextSearch } from '@modules/search-utils'
import { decodePostSearchCursor } from '@services/posts/search/get-ids-page-info'

const searchQuery = defineQueryContract({
  q: queryString(),
  limit: queryInteger({ minimum: 1, maximum: 100, default: 3 }),
  after: queryString(),
})

// GET /api/v1/search — combined omnisearch across all five verticals.
// Returns a lightweight payload with only the fields the command-search dialog renders.
// Individual vertical failures degrade to [] for that vertical.
app.route('/api/v1/search').get(async ctx => {
  apiQuery('GET:/api/v1/search', searchQuery)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/search')

  const rawQ = ctx.query.q as string | undefined
  let limit = clampLimit(ctx.query.limit !== undefined ? Number(ctx.query.limit) : undefined, 3)
  if (!currentUser) {
    limit = clampAnonLimit(limit)
  }
  const query = prepareQueryForValidation(ctx.query, searchQuery.queryContract)
  if (ctx.query.limit !== undefined) query.limit = limit
  validateRequestContract(ctx, 'GET:/api/v1/search', { query })

  const hashtagResult = await resolveHashtagTopicSearch(rawQ)
  const textSearchQuery = hashtagResult.textSearchQuery
  const hashtagTopicIds = hashtagResult.topicIds
  const hashtagAliasIds = hashtagResult.filters.flatMap(filter =>
    filter.kind === 'exact_alias' ? [filter.aliasId] : [],
  )
  const hasUnknownHashtag = hashtagResult.hasUnknown
  const postAfter = ctx.query.after as string | undefined
  if (postAfter) {
    const cursorOptions = { after: postAfter, text_search_query: textSearchQuery }
    decodePostSearchCursor(
      cursorOptions,
      detectSearchSort(cursorOptions),
      hasTextSearch(cursorOptions),
    )
  }

  if (
    hasUnknownHashtag ||
    (!textSearchQuery?.trim() && hashtagTopicIds.length === 0 && hashtagAliasIds.length === 0)
  ) {
    ctx.json({
      topics: [],
      posts: [],
      posts_page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
      news: [],
      domains: [],
      communities: [],
    })
    return
  }

  const result = await searchOmnisearch({
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    limit,
    postAfter,
  })

  setAnonymousPublicCacheHeaders(ctx, currentUser)

  ctx.json(result)
})
