import { upgradeVerifiedNativeSession } from '@services/jwt-session/native-upgrade'
import { getPrivateUserByAny } from '@services/users/get'
import { randomBytes } from 'node:crypto'
import { v7 } from 'uuid'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, validateRequestContract } from '../../response-helpers.mts'
import { setAuthenticationCookies } from '@modules/api-utils'
import { AUTH_REQUIRED, BYPASS_DISABLED } from '@modules/on-error/error-codes'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  getSessionForLogout,
  isSessionRevoked,
} from '@services/jwt-session'
import {
  isAppAttestationEnabled,
  storeAppAttestChallenge,
  verifyAndStoreAttestation,
  type AppAttestChallengeType,
} from '@services/app-attestation'

/** Closed request body for `POST /api/v1/app-attestation/challenge`. */
type AppAttestChallengeBody = { type: 'attestation' | 'assertion' }

/** Closed request body for `POST /api/v1/app-attestation/attest`; the iOS client sends camelCase keys. */
type AppAttestAttestBody = { keyId: string; attestation: string; challengeId: string }

// POST /api/v1/app-attestation/challenge — issue a single-use App Attest challenge.
// Device-scoped, not user-scoped: an anonymous device must be able to attest itself
// before it has ever signed in.
app.route('/api/v1/app-attestation/challenge').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/app-attestation/challenge')
  if (!isAppAttestationEnabled()) ctx.throw(403, 'App Attest is not enabled', BYPASS_DISABLED)

  const body = await parseJsonBody<AppAttestChallengeBody>(ctx, '1kb')
  validateRequestContract(ctx, 'POST:/api/v1/app-attestation/challenge', { body })
  const type: AppAttestChallengeType = body.type

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

  const body = await parseJsonBody<AppAttestAttestBody>(ctx, '100kb')
  validateRequestContract(ctx, 'POST:/api/v1/app-attestation/attest', { body })
  ctx.assert(body.keyId.length > 0, 422, 'keyId is required')
  ctx.assert(body.attestation.length > 0, 422, 'attestation is required')
  ctx.assert(body.challengeId.length > 0, 422, 'challengeId is required')

  // Inspect authority without rotating it: a rejected attestation must leave the caller's
  // current device credential usable. Only a verified proof admits the renewal below.
  const previous = await ctx.getSessionTokenData()
  const user = await ctx.getCurrentUser()
  const claims = user ? await getEnrichedSessionClaims(user) : null
  if (!user) {
    const principal = await getSessionForLogout({
      deviceToken: ctx.cookies.get('dt'),
      sessionToken: ctx.cookies.get('st'),
    })
    if (
      principal &&
      !(await isSessionRevoked(principal.sid, { userId: principal.uid, issuedAt: principal.iat }))
    ) {
      ctx.throw(401, 'Unauthorized', AUTH_REQUIRED)
    }
  }

  const result = await verifyAndStoreAttestation({
    challengeKey: body.challengeId,
    keyId: body.keyId,
    did: previous.did,
    attestation: Buffer.from(body.attestation, 'base64'),
  })

  const renewingNative = 'client' in previous && previous.client === 'native'
  // A first verified native upgrade uses a fresh SID; an existing browser binding is never cleared.
  const { deviceToken, sessionToken } =
    user && !renewingNative
      ? await upgradeVerifiedNativeSession({
          deviceToken: ctx.cookies.get('dt')!,
          uid: user.id,
          did: previous.did,
          sid: previous.sid,
          fetchUser: (uid, query) => getPrivateUserByAny(uid, { query, readOnly: false }),
        })
      : await createDeviceAndSessionTokens({
          did: previous.did,
          ...(renewingNative && {
            sid: previous.sid,
            deviceRenewal: 'verified-native-attestation' as const,
          }),
          uid: user?.id ?? null,
          roles: claims?.roles,
          membershipPlan: claims?.membershipPlan,
          membershipExpiresAt: claims?.membershipExpiresAt,
          trustTier: claims?.trustTier,
          uiLocale: claims?.uiLocale,
          deviceClass: 'attested',
        })
  setAuthenticationCookies(ctx, {
    dt: deviceToken.token,
    st: sessionToken.token,
    deviceClass: 'attested',
  })

  ctx.json({ environment: result.environment })
})
