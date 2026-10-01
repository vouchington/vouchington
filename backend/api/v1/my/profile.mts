import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getProfile, updateProfileMarkdown } from '@services/my/profile'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiArrayContract } from '../../response-contract.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import {
  listProfileLinks,
  createProfileLink,
  updateProfileLink,
  deleteProfileLink,
  reorderProfileLinks,
  MAX_PROFILE_LINKS,
  type ProfileLinkType,
} from '@services/my/profile-links'

type UpdateProfileRequest = { markdown: string }

type CreateProfileLinkRequest = {
  link_type: ProfileLinkType
  url?: string | null
  handle?: string | null
  name?: string | null
  image_id?: ApiUuidContract | null
}

type UpdateProfileLinkRequest = Omit<CreateProfileLinkRequest, 'link_type'>

type ReorderProfileLinksRequest = {
  ids: ApiArrayContract<ApiUuidContract, 1, typeof MAX_PROFILE_LINKS, true>
}

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

  const body = (await ctx.request.json('100kb')) as UpdateProfileRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/profile', { body })

  await updateProfileMarkdown(currentUser.id, body.markdown)

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

  const body = (await ctx.request.json('10kb')) as CreateProfileLinkRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/profile/links', { body })

  const link = await createProfileLink(currentUser.id, body)

  ctx.setStatus(201)
  ctx.json({ profile_link: link })
})

// PUT /api/v1/my/profile/links/order — must be before /:id routes
app.route('/api/v1/my/profile/links/order').put(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PUT:/api/v1/my/profile/links/order')

  const body = (await ctx.request.json('50kb')) as ReorderProfileLinksRequest
  validateRequestContract(ctx, 'PUT:/api/v1/my/profile/links/order', { body })

  await reorderProfileLinks(currentUser.id, body.ids)

  const links = await listProfileLinks(currentUser.id)
  ctx.json({ results: links })
})

// PATCH /api/v1/my/profile/links/:id
app.route('/api/v1/my/profile/links/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/profile/links/:id')

  const body = (await ctx.request.json('10kb')) as UpdateProfileLinkRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/profile/links/:id', { path: ctx.params, body })

  const link = await updateProfileLink(currentUser.id, ctx.params.id!, body)

  ctx.json({ profile_link: link })
})

// DELETE /api/v1/my/profile/links/:id
app.route('/api/v1/my/profile/links/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/profile/links/:id')
  validateRequestContract(ctx, 'DELETE:/api/v1/my/profile/links/:id', { path: ctx.params })

  await deleteProfileLink(currentUser.id, ctx.params.id!)

  ctx.setStatus(204)
})
