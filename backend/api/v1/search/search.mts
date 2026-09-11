import app from '../../app.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { searchOmnisearch } from '@services/search'
import { resolveHashtagTopicSearch } from '@services/search-params'
import { clampAnonLimit } from '@modules/search-utils'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'

// GET /api/v1/search — combined omnisearch across all five verticals.
// Returns a lightweight payload with only the fields the command-search dialog renders.
// Individual vertical failures degrade to [] for that vertical.
app.route('/api/v1/search').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/search')

  const rawQ = ctx.query.q as string | undefined
  let limit = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 3
  if (!currentUser) {
    limit = clampAnonLimit(limit)
  }

  let textSearchQuery: string | undefined
  let hashtagTopicIds: string[] = []
  let hashtagAliasIds: string[] = []
  let hasUnknownHashtag = false
  try {
    const result = await resolveHashtagTopicSearch(rawQ)
    textSearchQuery = result.textSearchQuery
    hashtagTopicIds = result.topicIds
    hashtagAliasIds = result.filters.flatMap(filter =>
      filter.kind === 'exact_alias' ? [filter.aliasId] : [],
    )
    hasUnknownHashtag = result.hasUnknown
  } catch (err) {
    sendHashtagTopicSearchErrorResponse(ctx, err)
    return
  }

  if (
    hasUnknownHashtag ||
    (!textSearchQuery?.trim() && hashtagTopicIds.length === 0 && hashtagAliasIds.length === 0)
  ) {
    ctx.json({ topics: [], posts: [], news: [], domains: [], communities: [] })
    return
  }

  const result = await searchOmnisearch({
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    limit,
  })

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json(result)
})
