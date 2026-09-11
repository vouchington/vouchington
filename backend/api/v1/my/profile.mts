import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getProfile, updateProfileMarkdown } from '@services/my/profile'
import { requireAuth } from '../../response-helpers.mts'
import {
  listProfileLinks,
  createProfileLink,
  updateProfileLink,
  deleteProfileLink,
  reorderProfileLinks,
  type ProfileLinkType,
} from '@services/my/profile-links'

// GET /api/v1/my/profile
app.route('/api/v1/my/profile').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/profile')

  const profile = await getProfile(currentUser.id)
  ctx.assert(profile, 404, 'Profile not found')

  ctx.json({ profile })
})

// PATCH /api/v1/my/profile
app.route('/api/v1/my/profile').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/profile')

  const body = (await ctx.request.json('100kb')) as Record<string, unknown>
  ctx.assert(typeof body.markdown === 'string', 400, 'markdown is required')

  await updateProfileMarkdown(currentUser.id, body.markdown as string)

  const profile = await getProfile(currentUser.id)
  ctx.json({ profile })
})

// GET /api/v1/my/profile/links
app.route('/api/v1/my/profile/links').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/profile/links')

  const links = await listProfileLinks(currentUser.id)
  ctx.json({ results: links })
})

// POST /api/v1/my/profile/links
app.route('/api/v1/my/profile/links').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/profile/links')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.link_type === 'string', 400, 'link_type is required')

  const link = await createProfileLink(currentUser.id, {
    link_type: body.link_type as ProfileLinkType,
    url: body.url as string | undefined,
    handle: body.handle as string | undefined,
    name: body.name as string | undefined,
    image_id: body.image_id as string | undefined,
  })

  ctx.setStatus(201)
  ctx.json({ profile_link: link })
})

// PUT /api/v1/my/profile/links/order — must be before /:id routes
app.route('/api/v1/my/profile/links/order').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/my/profile/links/order')

  const body = (await ctx.request.json('50kb')) as Record<string, unknown>
  ctx.assert(Array.isArray(body.ids), 400, 'ids must be an array')

  const ids = body.ids as string[]
  ctx.assert(
    ids.every(id => typeof id === 'string'),
    400,
    'All ids must be strings',
  )

  await reorderProfileLinks(currentUser.id, ids)

  const links = await listProfileLinks(currentUser.id)
  ctx.json({ results: links })
})

// PATCH /api/v1/my/profile/links/:id
app.route('/api/v1/my/profile/links/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/profile/links/:id')

  const linkId = ctx.params.id!
  ctx.assert(linkId, 400, 'id is required')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>

  const link = await updateProfileLink(currentUser.id, linkId, {
    url: 'url' in body ? (body.url as string | null) : undefined,
    handle: 'handle' in body ? (body.handle as string | null) : undefined,
    name: 'name' in body ? (body.name as string | null) : undefined,
    image_id: 'image_id' in body ? (body.image_id as string | null) : undefined,
  })

  ctx.json({ profile_link: link })
})

// DELETE /api/v1/my/profile/links/:id
app.route('/api/v1/my/profile/links/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/profile/links/:id')

  const linkId = ctx.params.id!
  ctx.assert(linkId, 400, 'id is required')

  await deleteProfileLink(currentUser.id, linkId)

  ctx.setStatus(204)
})
