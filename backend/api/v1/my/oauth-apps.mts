import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  createOwnedOAuthApp,
  listOwnedOAuthApps,
  OAuthProtocolError,
  revokeOwnedOAuthApp,
  rotateOwnedOAuthAppSecret,
  updateOwnedOAuthApp,
  type MAX_OAUTH_APP_SCOPES,
  type MAX_REDIRECT_URIS,
  type OAuthClientAuthMethod,
} from '@services/oauth-authorization-server'
import { assertNotSuspended } from '@services/users'
import { buildPageInfo, createPaginationParser, decodeScopedUuidCursor } from '@modules/pagination'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import {
  apiNoRequestBody,
  apiQuery,
  apiResponse,
  type ApiArrayContract,
} from '../../response-contract.mts'

type CreateOAuthAppRequest = {
  client_name: string
  redirect_uris: ApiArrayContract<string, 1, typeof MAX_REDIRECT_URIS, true>
  token_endpoint_auth_method?: OAuthClientAuthMethod
  scopes: ApiArrayContract<string, 1, typeof MAX_OAUTH_APP_SCOPES, true>
}

type UpdateOAuthAppRequest = {
  client_name?: string
  redirect_uris?: ApiArrayContract<string, 1, typeof MAX_REDIRECT_URIS, true>
}

const oauthAppsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

/** Client-metadata rejections are the owner's input errors, so they surface as 422. */
async function withClientMetadataErrors<T>(ctx: Context, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof OAuthProtocolError)) throw error
    ctx.throw(422, error.message)
  }
}

// GET /api/v1/my/oauth-apps — list the OAuth apps the current user registered
//
// Query-carrier validation is skipped for the same reason as GET /api/v1/my/api-keys: the shared
// registry does not coerce raw query strings, so it would reject a valid `?limit=10`.
app.route('/api/v1/my/oauth-apps').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/oauth-apps', oauthAppsParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/oauth-apps')

  const options = oauthAppsParser.parse(ctx.query)
  const scope = `my-oauth-apps:${currentUser.id}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await listOwnedOAuthApps(currentUser.id, {
    limit: options.limit,
    afterId,
  })
  ctx.json(
    apiResponse('GET:/api/v1/my/oauth-apps', {
      results,
      page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
    }),
  )
})

// POST /api/v1/my/oauth-apps — register an OAuth app owned by the current user
app.route('/api/v1/my/oauth-apps').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/oauth-apps')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as CreateOAuthAppRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/oauth-apps', { body })

  const issued = await withClientMetadataErrors(ctx, () =>
    createOwnedOAuthApp(currentUser.id, body),
  )
  ctx.setStatus(201)
  ctx.json(apiResponse('POST:/api/v1/my/oauth-apps', issued))
})

// PATCH /api/v1/my/oauth-apps/:id — rename an app or replace its redirect URIs
app.route('/api/v1/my/oauth-apps/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/oauth-apps/:id')
  assertNotSuspended(currentUser)

  const id = validateUUIDParam(ctx, 'id')
  const body = (await ctx.request.json('10kb')) as UpdateOAuthAppRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/oauth-apps/:id', { path: ctx.params, body })

  const oauthApp = await withClientMetadataErrors(ctx, () =>
    updateOwnedOAuthApp(currentUser.id, id, body),
  )
  ctx.assert(oauthApp, 404, 'OAuth app not found')
  ctx.json(apiResponse('PATCH:/api/v1/my/oauth-apps/:id', { oauth_app: oauthApp }))
})

// DELETE /api/v1/my/oauth-apps/:id — revoke an app and every credential issued to it
app.route('/api/v1/my/oauth-apps/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/oauth-apps/:id')
  assertNotSuspended(currentUser)

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'DELETE:/api/v1/my/oauth-apps/:id', { path: ctx.params })

  const revoked = await revokeOwnedOAuthApp(currentUser.id, id)
  ctx.assert(revoked, 404, 'OAuth app not found')
  ctx.setStatus(204)
})

// POST /api/v1/my/oauth-apps/:id/client-secrets — replace a confidential app's client secret
app.route('/api/v1/my/oauth-apps/:id/client-secrets').post(async (ctx: Context) => {
  apiNoRequestBody('POST:/api/v1/my/oauth-apps/:id/client-secrets')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/oauth-apps/:id/client-secrets')
  assertNotSuspended(currentUser)

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/my/oauth-apps/:id/client-secrets', {
    path: ctx.params,
  })

  const rotation = await rotateOwnedOAuthAppSecret(currentUser.id, id)
  ctx.assert(rotation.outcome !== 'not_found', 404, 'OAuth app not found')
  ctx.assert(rotation.outcome === 'rotated', 409, 'Public OAuth apps have no client secret')
  ctx.setStatus(201)
  ctx.json(apiResponse('POST:/api/v1/my/oauth-apps/:id/client-secrets', rotation.issued))
})
