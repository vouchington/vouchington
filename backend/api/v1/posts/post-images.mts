import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { canViewPost } from '@services/posts'
import { getPostImages, setPostImages, type PostImageInput } from '@services/posts/images'
import { assertNotSuspended } from '@services/users'
import { getRouteAccessPost } from './get-route-access-post.mts'
import { getOptionalAuthAndRateLimit, requireAuth } from '../../response-helpers.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

app.route('/api/v1/posts/:idOrSlug/images').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/posts/:idOrSlug/images')
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

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(post), 404, 'Post not found')

  const body = (await ctx.request.json('1mb')) as { images?: unknown }
  ctx.assert(Array.isArray(body?.images), 422, 'images must be an array')

  const images: PostImageInput[] = body.images.map((img: unknown, i: number) => {
    ctx.assert(img && typeof img === 'object', 422, `images[${i}] must be an object`)
    const { image_id, order_index, caption } = img as Record<string, unknown>
    ctx.assert(typeof image_id === 'string', 422, `images[${i}].image_id must be a string`)
    ctx.assert(
      typeof order_index === 'number' && Number.isInteger(order_index) && order_index >= 0,
      422,
      `images[${i}].order_index must be a non-negative integer`,
    )
    ctx.assert(
      caption === undefined || typeof caption === 'string',
      422,
      `images[${i}].caption must be a string`,
    )
    return { image_id, order_index, caption: caption as string | undefined }
  })

  const result = await setPostImages(currentUser, post, images)
  ctx.json({ images: result })
})
