import { withReauthenticatedAccountChange } from '@services/mfa/account-change'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, validateRequestContract } from '../../response-helpers.mts'
import { getExpectedOrigin } from '@modules/api-utils'
import { assertNotSuspended } from '@services/users/suspension'
import {
  getPasskeysByUserId,
  getPasskeyRegistrationOptions,
  renamePasskey,
  verifyPasskeyRegistration,
} from '@services/passkeys'
import { deletePasskeyWithMfaProtection } from '@services/mfa'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import { apiQuery } from '../../api-query-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import { deleteMfaFactor, listMfaFactors, renameMfaFactor } from './passkey-totp-route-helpers.mts'
import { enforceLowScoreBotChallenge } from '../../bot-challenge.mts'

const passkeysParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

async function applyPasskeyMutationGuards(ctx: Context, operation: string): Promise<void> {
  await ctx.applyRouteRateLimit(operation)
  await enforceLowScoreBotChallenge(ctx)
}

// ─── Registration (add passkey, requires auth) ────────────────────────────────

app.route('/api/v1/auth/passkeys/registration/options').post(async (ctx: Context) => {
  const [currentUser, deviceData] = await Promise.all([
    ctx.getCurrentUser(),
    ctx.getDeviceTokenData(),
  ])
  ctx.assert(currentUser, 401, 'Unauthorized')
  assertNotSuspended(currentUser)
  await applyPasskeyMutationGuards(ctx, 'POST:/api/v1/auth/passkeys/registration/options')
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
  await applyPasskeyMutationGuards(ctx, 'POST:/api/v1/auth/passkeys/registration/verify')

  const body = (await parseJsonBody(ctx, '100kb')) as {
    response?: unknown
    name?: string
    re_auth_token?: string
  }
  validateRequestContract(ctx, 'POST:/api/v1/auth/passkeys/registration/verify', { body })
  ctx.assert(body.response, 422, 'response is required')
  const expectedOrigin = getExpectedOrigin(ctx.req)
  const passkey = await withReauthenticatedAccountChange(
    currentUser.id,
    await ctx.getSessionTokenData(),
    body.re_auth_token,
    query =>
      verifyPasskeyRegistration(
        currentUser.id,
        deviceData.did,
        expectedOrigin,
        body.response,
        body.name,
        { query },
      ),
  )
  ctx.json({ passkey })
})

// ─── Management (requires auth) ───────────────────────────────────────────────

app.route('/api/v1/auth/passkeys').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/auth/passkeys', passkeysParser)
  const operation = 'GET:/api/v1/auth/passkeys'
  ctx.json(await listMfaFactors(ctx, operation, passkeysParser, 'passkeys', getPasskeysByUserId))
})

app.route('/api/v1/auth/passkeys/:id').patch(async (ctx: Context) => {
  apiRequestContract<'PATCH:/api/v1/auth/passkeys/:id', { name?: string }>(
    'PATCH:/api/v1/auth/passkeys/:id',
  )
  await renameMfaFactor(ctx, 'PATCH:/api/v1/auth/passkeys/:id', renamePasskey)
  ctx.setStatus(204)
})

app.route('/api/v1/auth/passkeys/:id').delete(async (ctx: Context) => {
  apiRequestContract<'DELETE:/api/v1/auth/passkeys/:id', { re_auth_token?: string }>(
    'DELETE:/api/v1/auth/passkeys/:id',
  )
  await deleteMfaFactor(ctx, 'DELETE:/api/v1/auth/passkeys/:id', deletePasskeyWithMfaProtection)
  ctx.setStatus(204)
})
