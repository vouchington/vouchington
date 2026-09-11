import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam, parseJsonBody } from '../../response-helpers.mts'
import { loadCommunityForViewer } from '@services/communities'
import { currentUserCanManageList, getListForWrite, importCommunityList } from '@services/lists'
import { assertNotSuspended } from '@services/users'

app.route('/api/v1/lists/:id/import').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/lists/:id/import')
  assertNotSuspended(currentUser)
  const listId = validateUUIDParam(ctx, 'id')
  const list = await getListForWrite(listId)
  ctx.assert(list, 404, 'List not found')
  ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

  const body = await parseJsonBody<{ community_slug: string }>(ctx)
  ctx.assert(
    body?.community_slug && typeof body.community_slug === 'string',
    422,
    'community_slug is required',
  )

  const { community } = await loadCommunityForViewer(currentUser, body.community_slug)

  const result = await importCommunityList(currentUser.id, {
    communityId: community.id,
    targetListId: listId,
  })

  ctx.setStatus(200)
  ctx.json(result)
})
