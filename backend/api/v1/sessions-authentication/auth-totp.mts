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
import { apiQuery, apiRequestContract } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import { deleteMfaFactor, listMfaFactors, renameMfaFactor } from './passkey-totp-route-helpers.mts'

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
  const operation = 'GET:/api/v1/auth/totp'
  ctx.json(await listMfaFactors(ctx, operation, totpParser, 'totp', getTotpAuthenticatorsByUserId))
})

// ─── Management (requires auth) ───────────────────────────────────────────────

app.route('/api/v1/auth/totp/:id').patch(async (ctx: Context) => {
  apiRequestContract<'PATCH:/api/v1/auth/totp/:id', { name?: string }>(
    'PATCH:/api/v1/auth/totp/:id',
  )
  await renameMfaFactor(ctx, 'PATCH:/api/v1/auth/totp/:id', renameTotpAuthenticator)
  ctx.setStatus(204)
})

app.route('/api/v1/auth/totp/:id').delete(async (ctx: Context) => {
  apiRequestContract<'DELETE:/api/v1/auth/totp/:id', { re_auth_token?: string }>(
    'DELETE:/api/v1/auth/totp/:id',
  )
  await deleteMfaFactor(
    ctx,
    'DELETE:/api/v1/auth/totp/:id',
    deleteTotpAuthenticatorWithMfaProtection,
  )
  ctx.setStatus(204)
})
