import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  loadCommunityWithViewer,
  type UpdateCommunityAutomodSettingsInput,
  updateCommunityAutomodSettings,
} from '@services/communities'
import { attachWrittenCommunityProvenance } from '@services/content-provenance'

app.route('/api/v1/communities/:idOrSlug/automod-settings').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/communities/:idOrSlug/automod-settings')
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser.id)
  const body = (await ctx.request.json('1mb')) as UpdateCommunityAutomodSettingsInput
  validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/automod-settings', {
    path: ctx.params,
    body,
  })

  const updated = await updateCommunityAutomodSettings(currentUser, community.id, body, membership)
  const { owner: _owner, ...communityData } = updated
  ctx.json({ community: await attachWrittenCommunityProvenance(communityData, currentUser) })
})
