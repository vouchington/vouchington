import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanVerifyOAuthClients,
  listOAuthClientsForVerification,
  OAUTH_CLIENT_VERIFICATION_FILTERS,
  unverifyOAuthClient,
  verifyOAuthClient,
  type OAuthClientVerificationFilter,
} from '@services/oauth-authorization-server'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import {
  buildPageInfo,
  createPaginationParser,
  decodeScopedUuidCursor,
  defineQueryContract,
  queryEnum,
} from '@modules/pagination'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'

type VerifyOAuthClientRequest = { client_name: string }

const oauthClientsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})
const oauthClientsFilterQuery = defineQueryContract({
  verification: queryEnum(['all', 'unverified', 'verified'] as const),
})

// GET /api/v1/admin/oauth-clients — dynamically registered clients awaiting or holding verification
//
// Query-carrier validation is skipped for the same reason as GET /api/v1/my/api-keys: the shared
// registry does not coerce raw query strings, so it would reject a valid `?limit=10`.
app.route('/api/v1/admin/oauth-clients').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/admin/oauth-clients', oauthClientsParser, oauthClientsFilterQuery)
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanVerifyOAuthClients,
    'GET:/api/v1/admin/oauth-clients',
  )

  const options = oauthClientsParser.parse(ctx.query)
  const verification = parseVerificationFilter(ctx, ctx.query.verification)
  const scope = `admin-oauth-clients:${verification}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await listOAuthClientsForVerification({
    verification,
    limit: options.limit,
    afterId,
  })
  const owners = await getUserPublicByAnyCachedBatch(
    results.flatMap(client => (client.owner_user_id ? [client.owner_user_id] : [])),
  )
  const ownersById = new Map(owners.flatMap(owner => (owner ? [[owner.id, owner]] : [])))
  ctx.json(
    apiResponse('GET:/api/v1/admin/oauth-clients', {
      results: results.map(client => ({
        ...client,
        owner: (client.owner_user_id && ownersById.get(client.owner_user_id)) || null,
      })),
      page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
    }),
  )
})

// PUT /api/v1/admin/oauth-clients/:id/verification — verify the exact client name staff reviewed
app.route('/api/v1/admin/oauth-clients/:id/verification').put(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanVerifyOAuthClients,
    'PUT:/api/v1/admin/oauth-clients/:id/verification',
  )

  const id = validateUUIDParam(ctx, 'id')
  const body = (await ctx.request.json('10kb')) as VerifyOAuthClientRequest
  validateRequestContract(ctx, 'PUT:/api/v1/admin/oauth-clients/:id/verification', {
    path: ctx.params,
    body,
  })

  const verification = await verifyOAuthClient(currentUser.id, id, body.client_name)
  ctx.assert(verification.outcome !== 'not_found', 404, 'OAuth client not found')
  ctx.assert(
    verification.outcome === 'verified',
    409,
    'OAuth client name changed or the client cannot be verified',
  )
  ctx.json(
    apiResponse('PUT:/api/v1/admin/oauth-clients/:id/verification', {
      oauth_client: verification.client,
    }),
  )
})

// DELETE /api/v1/admin/oauth-clients/:id/verification — clear a client's verification
app.route('/api/v1/admin/oauth-clients/:id/verification').delete(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanVerifyOAuthClients,
    'DELETE:/api/v1/admin/oauth-clients/:id/verification',
  )

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'DELETE:/api/v1/admin/oauth-clients/:id/verification', {
    path: ctx.params,
  })

  const cleared = await unverifyOAuthClient(id)
  ctx.assert(cleared, 404, 'OAuth client not found')
  ctx.setStatus(204)
})

function parseVerificationFilter(ctx: Context, value: unknown): OAuthClientVerificationFilter {
  if (value === undefined) return 'all'
  const filter = OAUTH_CLIENT_VERIFICATION_FILTERS.find(candidate => candidate === value)
  ctx.assert(
    filter,
    422,
    `verification must be one of: ${OAUTH_CLIENT_VERIFICATION_FILTERS.join(', ')}`,
  )
  return filter
}
