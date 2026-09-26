import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { listUserOAuthGrants, revokeUserOAuthGrant } from '@services/oauth-authorization-server'
import { assertNotSuspended } from '@services/users'
import { buildPageInfo, createPaginationParser, decodeScopedUuidCursor } from '@modules/pagination'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'

const oauthGrantsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

// GET /api/v1/my/oauth-grants — list the apps the current user has authorized
//
// Query-carrier validation is skipped for the same reason as GET /api/v1/my/api-keys: the shared
// registry does not coerce raw query strings, so it would reject a valid `?limit=10`.
app.route('/api/v1/my/oauth-grants').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/oauth-grants', oauthGrantsParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/oauth-grants')

  const options = oauthGrantsParser.parse(ctx.query)
  const scope = `my-oauth-grants:${currentUser.id}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await listUserOAuthGrants(currentUser.id, {
    limit: options.limit,
    afterId,
  })
  ctx.json(
    apiResponse('GET:/api/v1/my/oauth-grants', {
      results,
      page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
    }),
  )
})

// DELETE /api/v1/my/oauth-grants/:id — revoke an app's access to the current user's account
app.route('/api/v1/my/oauth-grants/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/oauth-grants/:id')
  assertNotSuspended(currentUser)

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'DELETE:/api/v1/my/oauth-grants/:id', { path: ctx.params })

  const revoked = await revokeUserOAuthGrant(currentUser.id, id)
  ctx.assert(revoked, 404, 'Connected app not found')
  ctx.setStatus(204)
})
