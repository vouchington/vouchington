import { streamJsonObject } from '@jongleberry/api-server'
import app from '../../app.mts'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getTrendingPosts, type TrendingPostsPostType } from '@services/trending-posts'
import {
  getPostByAnyCachedBatch,
  getPostMetricsByAnyCachedBatch,
  getPostElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { getTrendingPostsCached } from '@services/entity-fetch/search-caches'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { createPaginationParser } from '@modules/pagination'
import { indexById, isUUID } from '@modules/utils'
import { parseNumberParam } from '@ts-shared/utils/query'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { clampAnonLimit } from '@modules/search-utils'
import { maybeSanitizeElections } from '@services/elections-votes/shared/sanitize-election'
import { getPublicPostIds } from '@services/posts'
import {
  VALID_TRENDING_POST_TYPES,
  VALID_TRENDING_TIME_RANGES,
  isCatalogValue,
  type TrendingTimeRange,
} from '@ts-shared/feed-capabilities'

const trendingPostsParser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 20 },
})

app.route('/api/v1/trending-posts').get(async ctx => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/trending-posts')

  const paginationOptions = trendingPostsParser.parse(ctx.query)

  let timeRange: TrendingTimeRange = 'day'
  if (ctx.query.time_range !== undefined) {
    const tr = String(ctx.query.time_range)
    if (isCatalogValue(VALID_TRENDING_TIME_RANGES, tr)) {
      timeRange = tr
    } else {
      ctx.throw(400, 'Invalid time_range')
    }
  }

  let postType: TrendingPostsPostType | undefined
  if (ctx.query.post_type !== undefined) {
    const pt = String(ctx.query.post_type)
    if (isCatalogValue(VALID_TRENDING_POST_TYPES, pt)) {
      postType = pt
    } else {
      ctx.throw(400, 'Invalid post_type')
    }
  }

  let topicId: string | undefined
  if (ctx.query.topic_id !== undefined) {
    const tid = String(ctx.query.topic_id)
    if (!isUUID(tid)) {
      ctx.throw(400, 'Invalid topic_id: must be a valid UUID')
    }
    topicId = tid
  }

  const minScore = parseNumberParam(ctx.query, 'min_score')
  if (minScore !== undefined && minScore < 0) {
    ctx.throw(400, 'Min score must be >= 0')
  }

  const searchOptions = {
    ...paginationOptions,
    timeRange,
    ...(postType !== undefined && { postType }),
    ...(topicId !== undefined && { topicId }),
    ...(minScore !== undefined && { minScore }),
  }
  if (!currentUser) searchOptions.limit = clampAnonLimit(searchOptions.limit)

  const result = currentUser
    ? await getTrendingPosts(searchOptions)
    : await getTrendingPostsCached(searchOptions)
  if (!currentUser) {
    const publicPostIds = await getPublicPostIds(result.results.map(result => result.id))
    result.results = result.results.filter(result => publicPostIds.has(result.id))
  }
  const postIds = result.results.map((r: { id: string }) => r.id)

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    posts: getPostByAnyCachedBatch(postIds).then(indexById),
    posts_metrics: getPostMetricsByAnyCachedBatch(postIds).then(indexById),
    post_elections: getPostElectionByIdCachedBatch(postIds)
      .then(indexById)
      .then(elections => maybeSanitizeElections(currentUser, elections)),
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'post', postIds).then(bookmarks =>
      Object.keys(bookmarks).length > 0 ? bookmarks : undefined,
    )
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
