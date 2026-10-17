import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { createHash, randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { seedTestOAuthExchangeAttempts } from './oauth-exchange-attempts.mts'
export { deleteTestOAuthAuthorizationFixtures } from './oauth-authorization-fixture-cleanup.mts'

type TestOAuthAuthorizationProvider = 'facebook' | 'github' | 'x' | 'linkedin' | 'microsoft'
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
  facebook_account_id: string | null
  github_user_id: string | null
  x_user_id: string | null
  linkedin_account_id: string | null
  microsoft_account_id: string | null
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
  microsoftAccountId?: string
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
  const linkedinAccountId =
    provider === 'linkedin' && options.providerUserId
      ? await getLinkedInAccountId(options.providerUserId)
      : null
  const facebookAccountId =
    provider === 'facebook' && options.providerUserId
      ? await getFacebookAccountId(options.providerUserId)
      : null
  const completionTokenHash = options.completionToken
    ? hashToken(`oauth-authorization-broker:completion:${id}`, options.completionToken)
    : null
  await write(
    `/* insertTestOAuthAuthorization */ INSERT INTO oauth_authorizations (
       id, provider, purpose, callback_mode, rejected_at, expired_at, initiating_user_id,
       initiating_device_id, initiating_session_id, redirect_uri, state_hash,
       pkce_verifier_ciphertext, callback_code_ciphertext, callback_received_at,
       exchange_started_at, exchange_claim_id, completion_proof_challenge,
       completion_token_hash, completion_token_ciphertext, facebook_account_id,
       github_user_id, x_user_id, result_kind, result_user_id, result_device_id,
       result_session_id, completion_ready_at, completed_at, expires_at, updated_at,
       linkedin_account_id, microsoft_account_id
     )
     VALUES (
       $1, $2, $3, $4,
       CASE WHEN $5::text = 'rejected' THEN $28::timestamptz END,
       CASE WHEN $5::text = 'expired' THEN $28::timestamptz END,
       $6, $7, $8, $9, $10, 'test-pkce-ciphertext',
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
       $25, $26, $27, $28, $29, $30
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
      options.exchangeClaimId ? (options.updatedAt ?? new Date()) : null,
      options.exchangeClaimId ?? null,
      options.completionProofChallenge ?? null,
      completionTokenHash,
      options.completionTokenCiphertext ?? null,
      facebookAccountId,
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
      linkedinAccountId,
      provider === 'microsoft' ? (options.microsoftAccountId ?? null) : null,
    ],
  )
  await seedTestOAuthExchangeAttempts(id, options)
  return id
}

export async function getTestOAuthAuthorization(
  authorizationId: string,
): Promise<TestOAuthAuthorizationRow | null> {
  const { rows } = await read<TestOAuthAuthorizationRow>(
    `/* getTestOAuthAuthorization */ SELECT
       id, status, callback_error, callback_code_ciphertext, completion_token_hash,
       completion_token_ciphertext, exchange_claim_id, facebook_account_id,
       github_user_id, x_user_id, linkedin_account_id, microsoft_account_id, result_kind, result_user_id, result_device_id, result_session_id
     FROM view_oauth_authorization_current_records
     WHERE id = $1`,
    [authorizationId],
  )
  return rows[0] ?? null
}

async function getLinkedInAccountId(providerUserId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(
    `/* getTestLinkedInAccountId */ SELECT id FROM linkedin_accounts WHERE linkedin_user_id = $1`,
    [providerUserId],
  )
  if (!rows[0]) throw new Error('LinkedIn test account must exist before authorization fixture')
  return rows[0].id
}

async function getFacebookAccountId(providerUserId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(
    `/* getTestFacebookAccountId */ SELECT id FROM facebook_accounts WHERE facebook_user_id = $1`,
    [providerUserId],
  )
  if (!rows[0]) throw new Error('Facebook test account must exist before authorization fixture')
  return rows[0].id
}

export async function markTestOAuthAuthorizationExchanging(
  authorizationId: string,
  claimId: string,
): Promise<void> {
  await write(
    `/* markTestOAuthAuthorizationExchanging */ UPDATE oauth_authorizations
     SET callback_code_ciphertext = 'test-callback-ciphertext',
         callback_received_at = CURRENT_TIMESTAMP,
         exchange_claim_id = $2
     WHERE id = $1`,
    [authorizationId, claimId],
  )
}

/** Expire only the named owned flow after an observed queue ownership storage failure. */
export async function expireTestOAuthAuthorization(id: string): Promise<void> {
  const { rowCount } = await write(
    allowUnannotatedQuery(
      "UPDATE oauth_authorizations SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1",
    ),
    [id],
  )
  if (rowCount !== 1) throw new Error('Expected the exact owned authorization to expire')
}
