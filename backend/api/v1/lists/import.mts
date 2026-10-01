import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { loadCommunityForViewer } from '@services/communities'
import { getManageableList, importCommunityList } from '@services/lists'
import { assertNotSuspended } from '@services/users'

type ImportCommunityListBody = { community_slug: string }

app.route('/api/v1/lists/:id/import').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/lists/:id/import')
  assertNotSuspended(currentUser)
  const listId = validateUUIDParam(ctx, 'id')
  const list = await getManageableList(currentUser.id, listId)

  const body = (await ctx.request.json('1mb')) as ImportCommunityListBody
  validateRequestContract(ctx, 'POST:/api/v1/lists/:id/import', { path: ctx.params, body })
  ctx.assert(body.community_slug.length > 0, 422, 'community_slug is required')

  const { community } = await loadCommunityForViewer(currentUser, body.community_slug)

  const result = await importCommunityList(currentUser.id, {
    communityId: community.id,
    targetListId: list.id,
  })

  ctx.setStatus(200)
  ctx.json(result)
})
