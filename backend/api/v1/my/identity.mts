import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { updateUsername, updateProfileImageId } from '@services/my/identity'
import { assertNotSuspended } from '@services/users/suspension'
import { isOfficialAccount } from '@services/users/authorization'
import { getUserPrivateByAnyCached } from '@services/entity-fetch'
import { updateUserFields } from '@services/users/update-fields'
import type { OAuthProvider } from '@services/oauth'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiResponse } from '../../response-contract.mts'

type UpdateIdentityRequest = {
  username?: string
  use_display_name_from?: 'username' | OAuthProvider
  profile_image_id?: ApiUuidContract | null
}

// GET /api/v1/my/identity
app.route('/api/v1/my/identity').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/identity')

  const identity = await getUserPrivateByAnyCached(currentUser.id)
  ctx.assert(identity, 404, 'User not found')

  ctx.json(
    apiResponse('GET:/api/v1/my/identity', {
      identity: { ...identity, is_official_account: isOfficialAccount(identity) },
    }),
  )
})

// PATCH /api/v1/my/identity
app.route('/api/v1/my/identity').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/identity')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as UpdateIdentityRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/identity', { body })

  if (body.username !== undefined) {
    await updateUsername(currentUser.id, body.username)
  }

  if (body.use_display_name_from !== undefined) {
    await updateUserFields(currentUser.id, { use_display_name_from: body.use_display_name_from })
  }

  if (body.profile_image_id !== undefined) {
    await updateProfileImageId(currentUser.id, body.profile_image_id)
  }

  const identity = await getUserPrivateByAnyCached(currentUser.id)
  ctx.json({ identity: { ...identity, is_official_account: isOfficialAccount(identity) } })
})
