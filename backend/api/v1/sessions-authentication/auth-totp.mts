import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { deleteTotpAuthenticatorWithMfaProtection } from '@services/mfa'
import { assertNotSuspended } from '@services/users/suspension'
import {
  createTotpAuthenticator,
  verifyTotpSetup,
  getTotpAuthenticatorsByUserId,
  renameTotpAuthenticator,
} from '@services/totp'
import { apiQuery } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'
import { handleRenameRoute, parseOptionalReAuthToken } from './item-management-route-helpers.mts'

const totpParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

// ─── Setup (requires auth) ────────────────────────────────────────────────────

app.route('/api/v1/auth/totp').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/totp')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('100kb')) as { name?: string }
  validateRequestContract(ctx, 'POST:/api/v1/auth/totp', { body })
  const name = (body.name ?? 'My Authenticator').trim()

  const setupData = await createTotpAuthenticator(currentUser.id, name)
  ctx.json({
    authenticator: setupData.authenticator,
    secret: setupData.secret,
    uri: setupData.uri,
  })
})

app.route('/api/v1/auth/totp/setup/verification').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/totp/setup/verification')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('100kb')) as {
    authenticator_id?: string
    code?: string
  }
  validateRequestContract(ctx, 'POST:/api/v1/auth/totp/setup/verification', { body })
  ctx.assert(body.authenticator_id, 422, 'authenticator_id is required')
  ctx.assert(body.code, 422, 'code is required')

  const authenticator = await verifyTotpSetup(currentUser.id, body.authenticator_id, body.code)
  ctx.json({ authenticator })
})

// ─── List (requires auth) ─────────────────────────────────────────────────────

app.route('/api/v1/auth/totp').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/auth/totp', totpParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/auth/totp')

  const options = totpParser.parse(ctx.query)
  const scope = `totp:${currentUser.id}:created-at-asc-id-asc`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await getTotpAuthenticatorsByUserId(currentUser.id, {
    limit: options.limit,
    after: afterId ? { id: afterId } : undefined,
  })
  ctx.json({
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, scope) : null,
      end_cursor:
        hasNextPage && results.at(-1) ? encodeScopedUuidCursor(results.at(-1)!.id, scope) : null,
    },
  })
})

// ─── Management (requires auth) ───────────────────────────────────────────────

app
  .route('/api/v1/auth/totp/:id')
  .patch((ctx: Context) =>
    handleRenameRoute(ctx, 'PATCH:/api/v1/auth/totp/:id', renameTotpAuthenticator),
  )

app.route('/api/v1/auth/totp/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/auth/totp/:id')
  assertNotSuspended(currentUser)
  ctx.assert(ctx.params.id, 400, 'id required')
  const authenticatorId = ctx.params.id

  const reAuthToken = await parseOptionalReAuthToken(ctx, 'DELETE:/api/v1/auth/totp/:id')

  await deleteTotpAuthenticatorWithMfaProtection(currentUser.id, authenticatorId, reAuthToken)
  ctx.setStatus(204)
})
