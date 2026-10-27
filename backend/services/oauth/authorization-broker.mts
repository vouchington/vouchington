import { lockActiveAccountSession } from '@services/mfa/active-account-session'
import {
  assertBeginOwnership,
  assertCompletionProofChallenge,
  getBrokerCallbackUri,
} from './authorization-begin-guards.mts'
import { createProviderReAuthChallenge } from './provider-reauth-challenge.mts'
import { createHash, randomBytes } from 'node:crypto'
import { assertFreshReAuth, REAUTH_TTL_SECONDS } from '@services/mfa/re-auth'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import { v7 as uuidv7 } from 'uuid'
import {
  isOAuthAuthorizationBrokerEnabled,
  isOAuthReAuthBrokerEnabled,
  type BrokerCallbackMode,
  type BrokerOAuthProvider,
  type BrokerPurpose,
} from './broker-config.mts'
import {
  buildProviderAuthorizationUrl,
  getProviderClientId,
} from './authorization-provider-url.mts'
import { getPkceVerifierPurpose, hashOAuthAuthorizationState } from './authorization-secrets.mts'

const AUTHORIZATION_TTL_MS = 10 * 60 * 1000

export type BeginOAuthAuthorizationResult = {
  flow_id: string
  redirect_url: string
  expires_at: string
}

type BeginOAuthAuthorizationDependencies = {
  getClientId: typeof getProviderClientId
  isProviderEnabled: typeof isOAuthAuthorizationBrokerEnabled
  isReAuthProviderEnabled: typeof isOAuthReAuthBrokerEnabled
}

const defaultBeginDependencies: BeginOAuthAuthorizationDependencies = {
  getClientId: getProviderClientId,
  isProviderEnabled: isOAuthAuthorizationBrokerEnabled,
  isReAuthProviderEnabled: isOAuthReAuthBrokerEnabled,
}

export {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
  receiveOAuthAuthorizationCallback,
} from './authorization-callback.mts'

export async function beginOAuthAuthorization(
  options: {
    provider: BrokerOAuthProvider
    purpose: BrokerPurpose
    callbackMode: BrokerCallbackMode
    completionProofChallenge?: string
    currentUserId?: string
    reAuthToken?: string
    deviceId: string
    sessionId: string
    expectedOrigin: string
  },
  dependencies: Partial<BeginOAuthAuthorizationDependencies> = {},
): Promise<BeginOAuthAuthorizationResult> {
  assertBeginOwnership(options.purpose, options.currentUserId)
  assertCompletionProofChallenge(options.callbackMode, options.completionProofChallenge)
  await using query = await beginTransaction()
  if (options.purpose === 'connect') {
    const session = { sid: options.sessionId, did: options.deviceId }
    await lockActiveAccountSession(options.currentUserId!, session, query)
    await assertFreshReAuth(options.currentUserId!, session, options.reAuthToken, query)
  }

  const isProviderEnabled =
    dependencies.isProviderEnabled ?? defaultBeginDependencies.isProviderEnabled
  const enabled =
    options.purpose === 're_auth'
      ? (dependencies.isReAuthProviderEnabled ?? defaultBeginDependencies.isReAuthProviderEnabled)(
          options.provider,
        )
      : isProviderEnabled(options.provider, options.callbackMode)
  if (!enabled) {
    throw createHttpError(404, 'OAuth authorization broker is unavailable')
  }
  const getClientId = dependencies.getClientId ?? defaultBeginDependencies.getClientId
  const clientId = getClientId(options.provider)

  const id = uuidv7()
  const state = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const redirectUri = getBrokerCallbackUri(options.expectedOrigin, options.provider)
  const expiresAt = new Date(
    Date.now() +
      (options.purpose !== 'authenticate' ? REAUTH_TTL_SECONDS * 1000 : AUTHORIZATION_TTL_MS),
  )

  if (options.callbackMode === 'web' && options.purpose === 'authenticate') {
    await supersedeWebAuthentication(options.deviceId, options.sessionId, query)
  }
  const reAuth =
    options.purpose === 're_auth'
      ? await createProviderReAuthChallenge(
          {
            userId: options.currentUserId!,
            deviceId: options.deviceId,
            sessionId: options.sessionId,
            provider: options.provider,
            flowId: id,
          },
          { query },
        )
      : undefined
  await query(
    `/* beginOAuthAuthorization */ INSERT INTO oauth_authorizations (
        id,
        provider,
        purpose,
        callback_mode,
        initiating_user_id,
        initiating_device_id,
        initiating_session_id,
        redirect_uri,
        state_hash,
        pkce_verifier_ciphertext,
        completion_proof_challenge,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      options.provider,
      options.purpose,
      options.callbackMode,
      options.currentUserId ?? null,
      options.deviceId,
      options.sessionId,
      redirectUri,
      hashOAuthAuthorizationState(state),
      encryptSecret(codeVerifier, getPkceVerifierPurpose(id)),
      options.completionProofChallenge ?? null,
      expiresAt,
    ],
  )
  await query.commit()

  return {
    flow_id: id,
    redirect_url: buildProviderAuthorizationUrl({
      provider: options.provider,
      callbackMode: options.callbackMode,
      clientId,
      redirectUri,
      state,
      codeChallenge,
      ...(reAuth && { reAuthNonce: reAuth.nonce }),
    }),
    expires_at: expiresAt.toISOString(),
  }
}

async function supersedeWebAuthentication(
  deviceId: string,
  sessionId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(
    `/* supersedeWebAuthentication */ SELECT pg_advisory_xact_lock(
       hashtextextended($1, 0)
     )`,
    [`oauth-web-authentication:${deviceId}:${sessionId}`],
  )
  await query(
    `/* supersedeWebAuthentication */ UPDATE oauth_authorizations
     SET rejected_at = COALESCE(rejected_at, clock_timestamp()),
         callback_error = 'authorization_superseded',
         callback_code_ciphertext = NULL,
         completion_token_hash = NULL,
         completion_token_ciphertext = NULL,
         exchange_claim_id = NULL
     WHERE callback_mode = 'web'
       AND purpose = 'authenticate'
       AND initiating_device_id = $1
       AND initiating_session_id = $2
       AND status IN ('pending', 'callback_received', 'exchanging', 'completion_ready')`,
    [deviceId, sessionId],
  )
}
