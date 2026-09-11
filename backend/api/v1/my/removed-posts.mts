import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { listUserRemovedPosts } from '@services/communities'
import { apiResponse } from '../../response-contract.mts'

app.route('/api/v1/my/removed-posts').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/removed-posts')

  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25
  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  const includePlatform = ctx.query.include_platform === 'true'

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
