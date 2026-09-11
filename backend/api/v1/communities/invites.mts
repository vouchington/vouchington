import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  loadCommunityForModerator,
  searchInvites,
  createInvite,
  revokeInvite,
  redeemInviteCode,
  type CreateInviteInput,
} from '@services/communities'
import { indexById } from '@modules/utils'

app
  .route('/api/v1/communities/:idOrSlug/invites')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/invites')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const { community } = await loadCommunityForModerator(currentUser, idOrSlug)

    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
    const after = ctx.query.after as string | undefined

    const result = await searchInvites(community.id, { limit, after })

    const searchResults = result.results.map(i => ({
      __entity_type: 'community_invite' as const,
      id: i.id,
    }))

    const output: Record<string, unknown> = {
      results: searchResults,
      page_info: result.page_info,
      community_invites: indexById(result.results),
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/invites')

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const community = await getCommunityOrThrow(idOrSlug)

    const body = (await ctx.request.json('1mb')) as CreateInviteInput
    const invite = await createInvite(currentUser.id, community.id, body)

    ctx.setStatus(201)
    ctx.json({ community_invite: invite })
  })

app.route('/api/v1/communities/:idOrSlug/invites/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/communities/:idOrSlug/invites/:id')

  const { id } = ctx.params as { idOrSlug: string; id: string }

  await revokeInvite(currentUser.id, id)

  ctx.setStatus(204)
})

app.route('/api/v1/communities/invite-redemptions').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/invite-redemptions')

  const body = (await ctx.request.json('1mb')) as { code: string }
  ctx.assert(body.code, 422, 'code is required')

  const invite = await redeemInviteCode(currentUser.id, body.code)

  ctx.json({ community_invite: invite })
})
