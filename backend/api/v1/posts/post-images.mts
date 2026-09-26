import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { canViewPost, currentUserCanUpdatePost } from '@services/posts'
import { getPostImages, setPostImages, type PostImageInput } from '@services/posts/images'
import { assertNotSuspended } from '@services/users'
import { getRouteAccessPost } from './get-route-access-post.mts'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
} from '../../response-helpers.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app.route('/api/v1/posts/:idOrSlug/images').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/posts/:idOrSlug/images')
  validateRequestContract(ctx, 'GET:/api/v1/posts/:idOrSlug/images', { path: ctx.params })
  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const privacyPost = await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  const images = await getPostImages(post.id)
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    ctx.set('Vary', 'Cookie, Authorization')
  }
  ctx.json({ images })
})

app.route('/api/v1/posts/:idOrSlug/images').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/posts/:idOrSlug/images')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'PUT:/api/v1/posts/:idOrSlug/images', { path: ctx.params })

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(post), 404, 'Post not found')
  ctx.assert(currentUserCanUpdatePost(currentUser, post), 403, 'Forbidden')

  const body = (await ctx.request.json('1mb')) as { images: PostImageInput[] }
  validateRequestContract(ctx, 'PUT:/api/v1/posts/:idOrSlug/images', {
    body,
    path: ctx.params,
  })

  const result = await setPostImages(currentUser, post, body.images)
  ctx.json({ images: result })
})
