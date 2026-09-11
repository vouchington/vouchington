import { createHash, randomBytes } from 'node:crypto'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { FACEBOOK_APP_ID, GITHUB_CLIENT_ID, X_CLIENT_ID } from '@voucha/config'
import createHttpError from 'http-errors'
import { v7 as uuidv7 } from 'uuid'
import {
  isOAuthAuthorizationBrokerEnabled,
  type BrokerCallbackMode,
  type BrokerOAuthProvider,
  type BrokerPurpose,
} from './broker-config.mts'
import { buildProviderAuthorizationUrl } from './authorization-provider-url.mts'
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
}

const defaultBeginDependencies: BeginOAuthAuthorizationDependencies = {
  getClientId: getProviderClientId,
  isProviderEnabled: isOAuthAuthorizationBrokerEnabled,
}

export {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
  receiveOAuthAuthorizationCallback,
} from './authorization-callback.mts'
export { buildProviderAuthorizationUrl } from './authorization-provider-url.mts'

export async function beginOAuthAuthorization(
  options: {
    provider: BrokerOAuthProvider
    purpose: BrokerPurpose
    callbackMode: BrokerCallbackMode
    completionProofChallenge?: string
    currentUserId?: string
    deviceId: string
    sessionId: string
    expectedOrigin: string
  },
  dependencies: Partial<BeginOAuthAuthorizationDependencies> = {},
): Promise<BeginOAuthAuthorizationResult> {
  assertBeginOwnership(options.purpose, options.currentUserId)
  assertCompletionProofChallenge(options.callbackMode, options.completionProofChallenge)
  const isProviderEnabled =
    dependencies.isProviderEnabled ?? defaultBeginDependencies.isProviderEnabled
  if (!isProviderEnabled(options.provider, options.callbackMode)) {
    throw createHttpError(404, 'OAuth authorization broker is unavailable')
  }
  const getClientId = dependencies.getClientId ?? defaultBeginDependencies.getClientId
  const clientId = getClientId(options.provider)

  const id = uuidv7()
  const state = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const redirectUri = getBrokerCallbackUri(options.expectedOrigin, options.provider)
  const expiresAt = new Date(Date.now() + AUTHORIZATION_TTL_MS)

  await using query = await beginTransaction()
  if (options.callbackMode === 'web' && options.purpose === 'authenticate') {
    await supersedeWebAuthentication(options.deviceId, options.sessionId, query)
  }
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
      clientId,
      redirectUri,
      state,
      codeChallenge,
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
     SET status = 'rejected',
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

function assertBeginOwnership(purpose: BrokerPurpose, currentUserId?: string): void {
  if (purpose === 'connect' && !currentUserId) {
    throw createHttpError(401, 'Authentication required')
  }
  if (purpose === 'authenticate' && currentUserId) {
    throw createHttpError(409, 'Already authenticated')
  }
}

function assertCompletionProofChallenge(
  callbackMode: BrokerCallbackMode,
  challenge?: string,
): void {
  const valid = challenge !== undefined && /^[A-Za-z0-9_-]{43}$/.test(challenge)
  if (
    (callbackMode === 'native' && !valid) ||
    (callbackMode === 'web' && challenge !== undefined)
  ) {
    throw createHttpError(422, 'Invalid completion proof challenge')
  }
}

function getBrokerCallbackUri(expectedOrigin: string, provider: BrokerOAuthProvider): string {
  const origin = new URL(expectedOrigin).origin
  return `${origin}/auth/callback/${provider}/broker`
}

function getProviderClientId(provider: BrokerOAuthProvider): string {
  const clientIds = {
    facebook: FACEBOOK_APP_ID,
    x: X_CLIENT_ID,
    github: GITHUB_CLIENT_ID,
  }
  const clientId = clientIds[provider]
  if (!clientId) throw new Error(`${provider} OAuth client ID is not configured`)
  return clientId
}
