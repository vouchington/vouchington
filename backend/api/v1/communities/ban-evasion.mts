import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import {
  confirmBanEvasion,
  dismissBanEvasionFlag,
  getBanEvasionCommunity,
} from '@services/communities/ban-evasion'

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

    const community = await getBanEvasionCommunity(idOrSlug)
    validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/ban-evasion/:userId', {
      path: ctx.params,
    })

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

    const community = await getBanEvasionCommunity(idOrSlug)
    validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/ban-evasion/:userId', {
      path: ctx.params,
    })

    await dismissBanEvasionFlag(currentUser, community.id, userId)

    ctx.setStatus(204)
  })
