import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import type { OAuthAccount } from '@services/oauth-accounts'
import { getPrivateUserByAny } from '@services/users'
import { getAuthorizationAccountIdentifiers } from './authorization-account-identifiers.mts'
import { assertCompletionProof, safeEqual } from './authorization-completion-proof.mts'
import type {
  CompletionRow,
  OAuthAuthorizationCompletionOptions,
  PersistedOAuthAuthorizationCompletion,
  StoredOAuthAuthorizationCompletion,
} from './authorization-completion-types.mts'

const COMPLETION_TOKEN_HASH_PURPOSE = 'oauth-authorization-broker:completion'

export async function getAuthorizationForCompletion(
  flowId: string,
  query: TransactionQuery,
): Promise<CompletionRow> {
  const { rows } = await query(
    `/* getAuthorizationForCompletion */ SELECT *
     FROM oauth_authorizations
     WHERE id = $1
     FOR UPDATE`,
    [flowId],
  )
  const authorization = rows[0] as CompletionRow | undefined
  if (!authorization) throw createHttpError(404, 'OAuth authorization not found')
  return authorization
}

export function assertCompletionCaller(
  authorization: CompletionRow,
  options: OAuthAuthorizationCompletionOptions,
): void {
  const authenticatedReplay = isAuthenticatedCompletionReplay(authorization, options)
  if (
    (authorization.initiating_device_id !== options.deviceId ||
      authorization.initiating_session_id !== options.sessionId) &&
    !authenticatedReplay
  ) {
    throw createHttpError(403, 'OAuth authorization belongs to another session')
  }
  if (
    authorization.purpose === 'connect'
      ? authorization.initiating_user_id !== options.currentUserId
      : options.currentUserId !== undefined && !authenticatedReplay
  ) {
    throw createHttpError(403, 'OAuth authorization ownership changed')
  }
  if (
    (authorization.callback_mode === 'web' && options.completionTokenSource !== 'cookie') ||
    (authorization.callback_mode === 'native' && options.completionTokenSource !== 'body')
  ) {
    throw createHttpError(401, 'OAuth completion credential source is invalid')
  }
  const actualTokenHash = hashToken(
    `${COMPLETION_TOKEN_HASH_PURPOSE}:${authorization.id}`,
    options.completionToken,
  )
  if (
    !authorization.completion_token_hash ||
    !safeEqual(authorization.completion_token_hash, actualTokenHash)
  ) {
    throw createHttpError(401, 'OAuth completion token is invalid')
  }
  assertCompletionProof(authorization, options.completionProofVerifier)
}

function isAuthenticatedCompletionReplay(
  authorization: CompletionRow,
  options: OAuthAuthorizationCompletionOptions,
): boolean {
  return (
    authorization.purpose === 'authenticate' &&
    authorization.status === 'completed' &&
    authorization.result_kind === 'authenticated' &&
    authorization.result_user_id === options.currentUserId &&
    authorization.result_device_id === options.deviceId &&
    authorization.result_session_id === options.sessionId
  )
}

export async function getAuthorizationAccount(
  authorization: CompletionRow,
  query: TransactionQuery,
): Promise<OAuthAccount> {
  const providerUserId = {
    facebook: authorization.facebook_user_id,
    x: authorization.x_user_id,
    github: authorization.github_user_id,
  }[authorization.provider]
  if (!providerUserId) throw new Error('Completed OAuth exchange has no provider account')
  const config = getAuthorizationAccountIdentifiers(authorization.provider)
  const { rows } = await query(
    `/* getAuthorizationAccount */ SELECT
       user_id,
       ${config.providerUserIdColumn} AS provider_user_id,
       ${config.emailColumn} AS provider_user_email_address,
       ${config.dataColumn} AS provider_user_data
     FROM ${config.table}
     WHERE ${config.providerUserIdColumn} = $1`,
    [providerUserId],
  )
  const account = rows[0] as OAuthAccount | undefined
  if (!account) throw new Error('Completed OAuth provider account is missing')
  return account
}

export async function persistCompletionResult(
  flowId: string,
  result: PersistedOAuthAuthorizationCompletion,
  query: TransactionQuery,
): Promise<void> {
  const deviceId = result.kind === 'authenticated' ? result.deviceId : null
  const sessionId = result.kind === 'authenticated' ? result.sessionId : null
  const loginAttemptId = result.kind === 'mfa_required' ? result.loginAttemptId : null
  const { rowCount } = await query(
    `/* persistCompletionResult */ UPDATE oauth_authorizations
     SET status = 'completed',
         result_kind = $2,
         result_user_id = $3,
         result_device_id = $4,
         result_session_id = $5,
         login_attempt_id = $6,
         completion_token_ciphertext = NULL,
         completed_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'completion_ready'`,
    [flowId, result.kind, result.userId, deviceId, sessionId, loginAttemptId],
  )
  if (rowCount !== 1) throw createHttpError(409, 'OAuth authorization could not be completed')
}

export function getStoredCompletionResult(
  authorization: CompletionRow,
): StoredOAuthAuthorizationCompletion {
  if (!authorization.result_kind || !authorization.result_user_id) {
    throw new Error('Completed OAuth authorization has no durable result')
  }
  if (authorization.result_kind === 'mfa_required') {
    if (!authorization.login_attempt_id) {
      throw new Error('Completed OAuth MFA authorization has no login attempt')
    }
    return {
      kind: 'mfa_required',
      userId: authorization.result_user_id,
      loginAttemptId: authorization.login_attempt_id,
    }
  }
  if (authorization.result_kind === 'authenticated') {
    if (!authorization.result_device_id || !authorization.result_session_id) {
      throw new Error('Completed OAuth authentication has no durable device or session')
    }
    return {
      kind: 'authenticated',
      userId: authorization.result_user_id,
      deviceId: authorization.result_device_id,
      sessionId: authorization.result_session_id,
    }
  }
  return {
    kind: 'connected',
    userId: authorization.result_user_id,
  }
}

export async function requireCompletionUser(userId: string) {
  const user = await getPrivateUserByAny(userId, { readOnly: false })
  if (!user) throw new Error('Completed OAuth authorization user is missing')
  return user
}

export function getOAuthAccountName(account: OAuthAccount): string {
  return typeof account.provider_user_data.name === 'string' ? account.provider_user_data.name : ''
}
