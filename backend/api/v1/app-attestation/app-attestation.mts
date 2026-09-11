import { randomBytes } from 'node:crypto'
import { v7 } from 'uuid'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody } from '../../response-helpers.mts'
import { setAuthenticationCookies } from '@modules/api-utils'
import { BYPASS_DISABLED } from '@modules/on-error/error-codes'
import { createDeviceAndSessionTokens, refreshSessionState } from '@services/jwt-session'
import {
  isAppAttestationEnabled,
  storeAppAttestChallenge,
  verifyAndStoreAttestation,
  type AppAttestChallengeType,
} from '@services/app-attestation'
import { getPrivateUserByAny } from '@services/users/get'

const APP_ATTEST_CHALLENGE_TYPES: readonly AppAttestChallengeType[] = ['attestation', 'assertion']

// POST /api/v1/app-attestation/challenge — issue a single-use App Attest challenge.
// Device-scoped, not user-scoped: an anonymous device must be able to attest itself
// before it has ever signed in.
app.route('/api/v1/app-attestation/challenge').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/app-attestation/challenge')
  if (!isAppAttestationEnabled()) ctx.throw(403, 'App Attest is not enabled', BYPASS_DISABLED)

  const body = await parseJsonBody<{ type?: unknown }>(ctx, '1kb')
  ctx.assert(
    typeof body.type === 'string' &&
      APP_ATTEST_CHALLENGE_TYPES.includes(body.type as AppAttestChallengeType),
    422,
    'type must be "attestation" or "assertion"',
  )
  const type = body.type as AppAttestChallengeType

  const challengeId = v7()
  const challenge = randomBytes(32).toString('base64url')
  await storeAppAttestChallenge(type, challengeId, challenge)

  ctx.json({ challenge_id: challengeId, challenge })
})

// POST /api/v1/app-attestation/attest — verify a first-time App Attest key registration
// and upgrade the caller's device to `dc: 'attested'`, extending session expiry to 30
// days. Device-scoped: works for anonymous and signed-in callers alike.
app.route('/api/v1/app-attestation/attest').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/app-attestation/attest')
  if (!isAppAttestationEnabled()) ctx.throw(403, 'App Attest is not enabled', BYPASS_DISABLED)

  const body = await parseJsonBody<{
    keyId?: unknown
    attestation?: unknown
    challengeId?: unknown
  }>(ctx, '100kb')
  ctx.assert(typeof body.keyId === 'string' && body.keyId.length > 0, 422, 'keyId is required')
  ctx.assert(
    typeof body.attestation === 'string' && body.attestation.length > 0,
    422,
    'attestation is required',
  )
  ctx.assert(
    typeof body.challengeId === 'string' && body.challengeId.length > 0,
    422,
    'challengeId is required',
  )

  // Revalidate freshness/suspension via the same hot/warm/cold check used everywhere else
  // session state is trusted, and use its `did` (rather than blindly trusting the request's
  // `dt` cookie) to bind the newly-attested key. Assertion verification later rejects a key
  // whose bound `did` doesn't match the caller, so this binding must happen before storage.
  const refreshed = await refreshSessionState({
    deviceToken: ctx.cookies.get('dt'),
    sessionToken: ctx.cookies.get('st'),
    fetchUser: getPrivateUserByAny,
    verifyRevocationOnHotPath: true,
  })

  const result = await verifyAndStoreAttestation({
    challengeKey: body.challengeId,
    keyId: body.keyId,
    did: refreshed.did,
    attestation: Buffer.from(body.attestation, 'base64'),
  })

  // Always re-mint on successful attest — the whole point is the upgrade.
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did: refreshed.did,
    sid: refreshed.sid,
    uid: refreshed.uid,
    roles: refreshed.session.rol,
    membershipPlan: refreshed.session.mpl,
    membershipExpiresAt:
      refreshed.session.mpe === undefined ? undefined : new Date(refreshed.session.mpe * 1000),
    trustTier: refreshed.session.tt,
    uiLocale: refreshed.session.uil,
    deviceClass: 'attested',
  })
  setAuthenticationCookies(ctx, {
    dt: deviceToken.token,
    st: sessionToken.token,
    deviceClass: 'attested',
  })

  ctx.json({ environment: result.environment })
})
