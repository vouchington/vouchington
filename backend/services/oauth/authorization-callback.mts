import { randomBytes } from 'node:crypto'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import type { BrokerOAuthProvider } from './broker-config.mts'
import {
  getExistingCallbackHandoff,
  handoff,
  normalizeCallbackError,
  type OAuthAuthorizationRow,
  type ReceiveOAuthAuthorizationCallbackResult,
} from './authorization-callback-handoff.mts'
import {
  getCallbackCodePurpose,
  getCompletionTokenPurpose,
  getPkceVerifierPurpose,
  hashOAuthAuthorizationState,
  hashOAuthCallbackCode,
  hashOAuthCallbackError,
  hashOAuthCompletionToken,
} from './authorization-secrets.mts'

export type { ReceiveOAuthAuthorizationCallbackResult } from './authorization-callback-handoff.mts'

type ReceiveOAuthAuthorizationCallbackTransactionResult =
  | ReceiveOAuthAuthorizationCallbackResult
  | { expired: true; expiredAfterWrite?: string }

export async function receiveOAuthAuthorizationCallback(options: {
  provider: BrokerOAuthProvider
  state: string
  code?: string
  error?: string
}): Promise<ReceiveOAuthAuthorizationCallbackResult> {
  if (!options.state) throw createHttpError(400, 'OAuth callback is invalid')
  // A provider result is either a code or an error. Rejecting mixed payloads keeps first receipt
  // and replay bound to exactly one stored callback value.
  if (Boolean(options.code) === Boolean(options.error))
    throw createHttpError(400, 'OAuth callback is invalid')

  await using query = await beginTransaction()
  const result = await receiveCallbackInTransaction()
  if ('expired' in result && result.expiredAfterWrite) {
    // The guarded write waited past the deadline. Undo the receipt before recording expiry.
    await query.rollback()
    await expireAuthorization(write, result.expiredAfterWrite)
  } else {
    await query.commit()
  }
  if ('expired' in result) throw createHttpError(410, 'OAuth authorization expired')
  return result

  async function receiveCallbackInTransaction(): Promise<ReceiveOAuthAuthorizationCallbackTransactionResult> {
    const authorization = await readAuthorization()
    const decisionAt = new Date()
    if (authorization.status !== 'pending' || authorization.expires_at <= decisionAt)
      return resolveExisting(authorization)
    const completionToken = randomBytes(32).toString('base64url')
    if (options.error) {
      const { rows } = await query<{ expires_at: Date }>(
        `/* receiveOAuthAuthorizationCallback:accept */ UPDATE oauth_authorizations
         SET rejected_at = COALESCE(rejected_at, clock_timestamp()),
             callback_error = $2,
             callback_error_hash = $3,
             completion_token_hash = $4,
             completion_token_ciphertext = $5,
             callback_received_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending' AND expires_at > $6 RETURNING expires_at`,
        [
          authorization.id,
          normalizeCallbackError(options.error),
          hashOAuthCallbackError(authorization.id, options.error),
          hashOAuthCompletionToken(authorization.id, completionToken),
          encryptSecret(completionToken, getCompletionTokenPurpose(authorization.id)),
          decisionAt,
        ],
      )
      return resolveReceipt(authorization, rows[0], completionToken, false)
    }

    const { rows } = await query<{ expires_at: Date }>(
      `/* receiveOAuthAuthorizationCallback:accept */ UPDATE oauth_authorizations
       SET callback_code_ciphertext = $2,
           callback_code_hash = $3,
           completion_token_hash = $4,
           completion_token_ciphertext = $5,
           callback_received_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' AND expires_at > $6 RETURNING expires_at`,
      [
        authorization.id,
        encryptSecret(options.code!, getCallbackCodePurpose(authorization.id)),
        hashOAuthCallbackCode(authorization.id, options.code!),
        hashOAuthCompletionToken(authorization.id, completionToken),
        encryptSecret(completionToken, getCompletionTokenPurpose(authorization.id)),
        decisionAt,
      ],
    )
    return resolveReceipt(authorization, rows[0], completionToken, true)
  }

  async function resolveReceipt(
    authorization: OAuthAuthorizationRow,
    written: { expires_at: Date } | undefined,
    completionToken: string,
    exchangeRequired: boolean,
  ): Promise<ReceiveOAuthAuthorizationCallbackTransactionResult> {
    if (!written) return resolveExisting(await readAuthorization())
    if (written.expires_at <= new Date())
      return { expired: true, expiredAfterWrite: authorization.id }
    return handoff(
      { ...authorization, expires_at: written.expires_at },
      completionToken,
      exchangeRequired,
    )
  }

  async function resolveExisting(
    authorization: OAuthAuthorizationRow,
  ): Promise<ReceiveOAuthAuthorizationCallbackTransactionResult> {
    if (authorization.expires_at > new Date())
      return getExistingCallbackHandoff(authorization, options)
    if (authorization.status !== 'completed') await expireAuthorization(query, authorization.id)
    return { expired: true }
  }

  async function readAuthorization(): Promise<OAuthAuthorizationRow> {
    const { rows } = await query(
      `/* receiveOAuthAuthorizationCallback:read */ SELECT *
       FROM view_oauth_authorization_current_records WHERE state_hash = $1 AND provider = $2`,
      [hashOAuthAuthorizationState(options.state), options.provider],
    )
    const authorization = rows[0] as OAuthAuthorizationRow | undefined
    if (!authorization) throw createHttpError(400, 'OAuth callback is invalid')
    return authorization
  }
}

async function expireAuthorization(query: QueryExecutor, authorizationId: string): Promise<void> {
  await query(
    `/* expireOAuthAuthorizationCallback */ UPDATE oauth_authorizations
     SET expired_at = CASE WHEN rejected_at IS NULL THEN COALESCE(expired_at, clock_timestamp()) ELSE expired_at END,
         callback_code_ciphertext = NULL,
         completion_token_ciphertext = NULL
     WHERE id = $1 AND expires_at <= $2 AND status <> 'completed'`,
    [authorizationId, new Date()],
  )
}

export function decryptOAuthAuthorizationCode(flowId: string, ciphertext: string): string {
  return decryptSecret(ciphertext, getCallbackCodePurpose(flowId))
}

export function decryptOAuthAuthorizationPkceVerifier(flowId: string, ciphertext: string): string {
  return decryptSecret(ciphertext, getPkceVerifierPurpose(flowId))
}
