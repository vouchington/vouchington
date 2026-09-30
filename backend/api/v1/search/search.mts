import app from '../../app.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { searchOmnisearch } from '@services/search'
import { resolveHashtagTopicSearch } from '@services/search-params'
import { clampAnonLimit } from '@modules/search-utils'

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

  const hashtagResult = await resolveHashtagTopicSearch(rawQ)
  const textSearchQuery = hashtagResult.textSearchQuery
  const hashtagTopicIds = hashtagResult.topicIds
  const hashtagAliasIds = hashtagResult.filters.flatMap(filter =>
    filter.kind === 'exact_alias' ? [filter.aliasId] : [],
  )
  const hasUnknownHashtag = hashtagResult.hasUnknown

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
