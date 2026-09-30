import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryBoolean, queryInteger, queryString } from '@modules/pagination'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { listUserRemovedPosts } from '@services/communities'
import { apiQuery, apiResponse } from '../../response-contract.mts'

// The handler reads these leniently: a `limit` that is not a positive integer falls back to 25, a
// larger one is clamped to 100, a repeated `after` is ignored, and only `include_platform=true`
// includes platform removals. It validates the values it settled on, so this contract publishes the
// accepted shape without rejecting any input.
const removedPostsQuery = defineQueryContract({
  after: queryString({ description: 'Opaque cursor from page_info.end_cursor.' }),
  include_platform: queryBoolean({ description: 'Only the literal value true includes them.' }),
  limit: queryInteger(
    { minimum: 1, maximum: 100, default: 25 },
    { description: 'Larger values are clamped to 100; other invalid values use 25.' },
  ),
})

app.route('/api/v1/my/removed-posts').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/removed-posts', removedPostsQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/removed-posts')

  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25
  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  const includePlatform = ctx.query.include_platform === 'true'
  validateRequestContract(ctx, 'GET:/api/v1/my/removed-posts', {
    query: {
      limit,
      include_platform: includePlatform,
      ...(after === undefined ? {} : { after }),
    },
  })

  const { results, page_info } = await listUserRemovedPosts(currentUser.id, {
    limit,
    after,
    includePlatform,
  })

  const removed_posts = results.map(item => ({
    post_id: item.post_id,
    post_title: item.post_title,
    post_declared_language: item.post_declared_language,
    post_lingua_rs_detected_language: item.post_lingua_rs_detected_language,
    community_id: item.community_id,
    community_slug: item.community_slug,
    unpublished_at: item.unpublished_at,
    post_removal_kind: item.post_removal_kind,
    __entity_type: 'removed_post' as const,
  }))

  const response = { removed_posts, page_info }
  if (includePlatform) {
    ctx.json(apiResponse('GET:/api/v1/my/removed-posts#include-platform', response))
    return
  }
  ctx.json(response)
})
