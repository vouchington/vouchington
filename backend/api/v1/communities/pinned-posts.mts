import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, requireAuth } from '../../response-helpers.mts'
import {
  loadCommunityForViewer,
  loadCommunityForModerator,
  getPinnedPosts,
  setPinnedPosts,
} from '@services/communities'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app.route('/api/v1/communities/:idOrSlug/pinned-posts').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/pinned-posts',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }

  const { community } = await loadCommunityForViewer(currentUser, idOrSlug)

  const pinnedPosts = await getPinnedPosts(community.id, currentUser ?? null)

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.json({ pinned_posts: pinnedPosts })
})

app.route('/api/v1/communities/:idOrSlug/pinned-posts').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/communities/:idOrSlug/pinned-posts')

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community } = await loadCommunityForModerator(currentUser, idOrSlug)

  const body = (await ctx.request.json('1mb')) as { post_ids: string[] }
  ctx.assert(
    body && typeof body === 'object' && !Array.isArray(body),
    422,
    'Request body must be an object',
  )
  ctx.assert(
    Array.isArray(body.post_ids) && body.post_ids.every(id => typeof id === 'string'),
    422,
    'post_ids must be an array of strings',
  )

  const pinnedPosts = await setPinnedPosts(currentUser, community.id, body.post_ids)

  ctx.json({ pinned_posts: pinnedPosts })
})
