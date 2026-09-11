import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getExpectedOrigin } from '@modules/api-utils'
import { assertNotSuspended } from '@services/users/suspension'
import {
  getPasskeysByUserId,
  getPasskeyRegistrationOptions,
  renamePasskey,
  verifyPasskeyRegistration,
} from '@services/passkeys'
import { deletePasskeyWithMfaProtection } from '@services/mfa'
import { apiQuery } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'

const passkeysParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

// ─── Registration (add passkey, requires auth) ────────────────────────────────

app.route('/api/v1/auth/passkeys/registration/options').post(async (ctx: Context) => {
  const [currentUser, deviceData] = await Promise.all([
    ctx.getCurrentUser(),
    ctx.getDeviceTokenData(),
  ])
  ctx.assert(currentUser, 401, 'Unauthorized')
  assertNotSuspended(currentUser)
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/passkeys/registration/options')
  const options = await getPasskeyRegistrationOptions(currentUser, deviceData.did)
  ctx.json({ options })
})

app.route('/api/v1/auth/passkeys/registration/verify').post(async (ctx: Context) => {
  const [currentUser, deviceData] = await Promise.all([
    ctx.getCurrentUser(),
    ctx.getDeviceTokenData(),
  ])
  ctx.assert(currentUser, 401, 'Unauthorized')
  assertNotSuspended(currentUser)
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/passkeys/registration/verify')

  const body = (await ctx.request.json('100kb')) as { response?: unknown; name?: string }
  ctx.assert(body.response, 422, 'response is required')
  const expectedOrigin = getExpectedOrigin(ctx.req)
  const passkey = await verifyPasskeyRegistration(
    currentUser.id,
    deviceData.did,
    expectedOrigin,
    body.response,
    body.name,
  )
  ctx.json({ passkey })
})

// ─── Management (requires auth) ───────────────────────────────────────────────

app.route('/api/v1/auth/passkeys').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/auth/passkeys', passkeysParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/auth/passkeys')

  const options = passkeysParser.parse(ctx.query)
  const scope = `passkeys:${currentUser.id}:created-at-asc-id-asc`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await getPasskeysByUserId(currentUser.id, {
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

app.route('/api/v1/auth/passkeys/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/auth/passkeys/:id')
  assertNotSuspended(currentUser)
  ctx.assert(ctx.params.id, 400, 'id required')

  const body = (await ctx.request.json('100kb')) as { name?: string }
  const name = (body.name ?? '').trim()
  ctx.assert(name.length > 0 && name.length <= 100, 422, 'name must be 1–100 characters')

  await renamePasskey(currentUser.id, ctx.params.id, name)
  ctx.setStatus(204)
})

app.route('/api/v1/auth/passkeys/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/auth/passkeys/:id')
  assertNotSuspended(currentUser)
  ctx.assert(ctx.params.id, 400, 'id required')
  const passkeyId = ctx.params.id

  // Treat a missing or unparseable body as an absent re_auth_token so clients
  // reliably receive MFA_REAUTH_REQUIRED rather than a 400 JSON parse error.
  let reAuthToken: string | undefined
  if (ctx.request.is('json')) {
    const body = (await ctx.request.json('100kb').catch(() => ({}))) as { re_auth_token?: string }
    reAuthToken = body.re_auth_token
  }

  await deletePasskeyWithMfaProtection(currentUser.id, passkeyId, reAuthToken)
  ctx.setStatus(204)
})
