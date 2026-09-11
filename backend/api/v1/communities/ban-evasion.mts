import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam } from '../../response-helpers.mts'
import { getCommunityOrThrow } from '@services/communities'
import { assertNotSuspended } from '@services/users'
import { confirmBanEvasion, dismissBanEvasionFlag } from '@services/communities/ban-evasion'

app
  .route('/api/v1/communities/:idOrSlug/ban-evasion/:userId')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/ban-evasion/:userId',
    )
    assertNotSuspended(currentUser)

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const userId = validateUUIDParam(ctx, 'userId')

    const community = await getCommunityOrThrow(idOrSlug)
    ctx.assert(!community.archived_at, 403, 'Community is archived')

    await confirmBanEvasion(currentUser, community.id, userId)

    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/communities/:idOrSlug/ban-evasion/:userId',
    )
    assertNotSuspended(currentUser)

    const { idOrSlug } = ctx.params as { idOrSlug: string }
    const userId = validateUUIDParam(ctx, 'userId')

    const community = await getCommunityOrThrow(idOrSlug)
    ctx.assert(!community.archived_at, 403, 'Community is archived')

    await dismissBanEvasionFlag(currentUser, community.id, userId)

    ctx.setStatus(204)
  })
