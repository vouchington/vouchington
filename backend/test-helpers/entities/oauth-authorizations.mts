import { createHash, randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'

type TestOAuthAuthorizationProvider = 'facebook' | 'github' | 'x'
type TestOAuthAuthorizationPurpose = 'authenticate' | 'connect'
type TestOAuthAuthorizationCallbackMode = 'native' | 'web'
type TestOAuthAuthorizationStatus =
  | 'pending'
  | 'callback_received'
  | 'exchanging'
  | 'completion_ready'
  | 'completed'
  | 'rejected'
  | 'expired'

export type TestOAuthAuthorizationRow = {
  id: string
  status: string
  callback_error: string | null
  callback_code_ciphertext: string | null
  completion_token_hash: string | null
  completion_token_ciphertext: string | null
  exchange_claim_id: string | null
  facebook_user_id: string | null
  github_user_id: string | null
  x_user_id: string | null
  result_kind: string | null
  result_user_id: string | null
  result_device_id: string | null
  result_session_id: string | null
}

export type InsertTestOAuthAuthorizationOptions = {
  id?: string
  provider?: TestOAuthAuthorizationProvider
  purpose?: TestOAuthAuthorizationPurpose
  callbackMode?: TestOAuthAuthorizationCallbackMode
  status?: TestOAuthAuthorizationStatus
  initiatingUserId?: string
  deviceId?: string
  sessionId?: string
  state?: string
  completionProofChallenge?: string
  completionToken?: string
  completionTokenCiphertext?: string
  callbackCodeCiphertext?: string
  callbackReceivedAt?: Date
  exchangeAttempts?: number
  exchangeClaimId?: string
  providerUserId?: string
  resultKind?: 'authenticated' | 'connected'
  resultUserId?: string
  resultDeviceId?: string
  resultSessionId?: string
  completionReadyAt?: Date
  completedAt?: Date
  expiresAt?: Date
  updatedAt?: Date
}

export async function insertTestOAuthAuthorization(
  options: InsertTestOAuthAuthorizationOptions = {},
): Promise<string> {
  const id = options.id ?? uuidv7()
  const provider = options.provider ?? 'github'
  const completionTokenHash = options.completionToken
    ? hashToken(`oauth-authorization-broker:completion:${id}`, options.completionToken)
    : null
  await write(
    `/* insertTestOAuthAuthorization */ INSERT INTO oauth_authorizations (
       id, provider, purpose, callback_mode, status, initiating_user_id,
       initiating_device_id, initiating_session_id, redirect_uri, state_hash,
       pkce_verifier_ciphertext, callback_code_ciphertext, callback_received_at,
       exchange_attempts, exchange_claim_id, completion_proof_challenge,
       completion_token_hash, completion_token_ciphertext, facebook_user_id,
       github_user_id, x_user_id, result_kind, result_user_id, result_device_id,
       result_session_id, completion_ready_at, completed_at, expires_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'test-pkce-ciphertext',
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
       $25, $26, $27, $28
     )`,
    [
      id,
      provider,
      options.purpose ?? 'authenticate',
      options.callbackMode ?? 'web',
      options.status ?? 'pending',
      options.initiatingUserId ?? null,
      options.deviceId ?? randomUUID(),
      options.sessionId ?? randomUUID(),
      `https://example.com/auth/callback/${provider}/broker`,
      options.state
        ? hashToken('oauth-authorization-broker:state', options.state)
        : createHash('sha256').update(randomUUID()).digest('hex'),
      options.callbackCodeCiphertext ?? null,
      options.callbackReceivedAt ?? null,
      options.exchangeAttempts ?? 0,
      options.exchangeClaimId ?? null,
      options.completionProofChallenge ?? null,
      completionTokenHash,
      options.completionTokenCiphertext ?? null,
      provider === 'facebook' ? (options.providerUserId ?? null) : null,
      provider === 'github' ? (options.providerUserId ?? null) : null,
      provider === 'x' ? (options.providerUserId ?? null) : null,
      options.resultKind ?? null,
      options.resultUserId ?? null,
      options.resultDeviceId ?? (options.resultKind === 'authenticated' ? uuidv7() : null),
      options.resultSessionId ?? (options.resultKind === 'authenticated' ? uuidv7() : null),
      options.completionReadyAt ?? null,
      options.completedAt ?? null,
      options.expiresAt ?? new Date(Date.now() + 10 * 60_000),
      options.updatedAt ?? new Date(),
    ],
  )
  return id
}

export async function getTestOAuthAuthorization(
  authorizationId: string,
): Promise<TestOAuthAuthorizationRow | null> {
  const { rows } = await read<TestOAuthAuthorizationRow>(
    `/* getTestOAuthAuthorization */ SELECT
       id, status, callback_error, callback_code_ciphertext, completion_token_hash,
       completion_token_ciphertext, exchange_claim_id, facebook_user_id,
       github_user_id, x_user_id, result_kind, result_user_id, result_device_id, result_session_id
     FROM oauth_authorizations
     WHERE id = $1`,
    [authorizationId],
  )
  return rows[0] ?? null
}

export async function markTestOAuthAuthorizationExchanging(
  authorizationId: string,
  claimId: string,
): Promise<void> {
  await write(
    `/* markTestOAuthAuthorizationExchanging */ UPDATE oauth_authorizations
     SET status = 'exchanging',
         callback_code_ciphertext = 'test-callback-ciphertext',
         callback_received_at = CURRENT_TIMESTAMP,
         exchange_claim_id = $2
     WHERE id = $1`,
    [authorizationId, claimId],
  )
}

export async function deleteTestOAuthAuthorizationFixtures(fixtures: {
  authorizationIds?: string[]
  facebookUserIds?: string[]
  githubUserIds?: string[]
  xUserIds?: string[]
  userIds?: string[]
}): Promise<void> {
  await deleteRowsByIds('oauth_authorizations', 'id', fixtures.authorizationIds)
  await deleteRowsByIds('github_accounts', 'github_user_id', fixtures.githubUserIds)
  await deleteRowsByIds('facebook_accounts', 'facebook_user_id', fixtures.facebookUserIds)
  await deleteRowsByIds('x_accounts', 'x_user_id', fixtures.xUserIds)
  await deleteRowsByIds('users', 'id', fixtures.userIds)
}

async function deleteRowsByIds(
  table: 'oauth_authorizations' | 'facebook_accounts' | 'github_accounts' | 'users' | 'x_accounts',
  column: 'facebook_user_id' | 'github_user_id' | 'id' | 'x_user_id',
  ids: string[] | undefined,
): Promise<void> {
  if (!ids?.length) return
  await write(
    `/* deleteTestOAuthAuthorizationFixtures */ DELETE FROM ${table}
     WHERE ${column} = ANY($1::${column === 'id' ? 'uuid' : 'text'}[])`,
    [ids],
  )
}
