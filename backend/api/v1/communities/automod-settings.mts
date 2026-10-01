import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  getCommunityMember,
  getCommunityOrThrow,
  updateCommunityAutomodSettings,
  type UpdateCommunityAutomodSettingsInput,
} from '@services/communities'

app.route('/api/v1/communities/:idOrSlug/automod-settings').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/communities/:idOrSlug/automod-settings')
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)
  const body = (await ctx.request.json('1mb')) as UpdateCommunityAutomodSettingsInput
  validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/automod-settings', {
    path: ctx.params,
    body,
  })

  const updated = await updateCommunityAutomodSettings(currentUser, community.id, body, membership)
  const { owner: _owner, ...communityData } = updated
  ctx.json({ community: communityData })
})
