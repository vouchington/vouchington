import { randomBytes } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import type { BrokerCallbackMode, BrokerOAuthProvider, BrokerPurpose } from './broker-config.mts'
import {
  getExistingCallbackHandoff,
  handoff,
  normalizeCallbackError,
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

export type OAuthAuthorizationRow = {
  id: string
  provider: BrokerOAuthProvider
  purpose: BrokerPurpose
  callback_mode: BrokerCallbackMode
  status:
    | 'pending'
    | 'callback_received'
    | 'exchanging'
    | 'completion_ready'
    | 'completed'
    | 'rejected'
    | 'expired'
  completion_token_ciphertext: string | null
  callback_code_hash: string | null
  callback_error: string | null
  callback_error_hash: string | null
  expires_at: Date
}

export type ReceiveOAuthAuthorizationCallbackResult = {
  flowId: string
  callbackMode: BrokerCallbackMode
  completionToken: string
  exchangeRequired: boolean
  expiresAt: Date
}

type ReceiveOAuthAuthorizationCallbackTransactionResult =
  | ReceiveOAuthAuthorizationCallbackResult
  | { expired: true }

export async function receiveOAuthAuthorizationCallback(
  options: {
    provider: BrokerOAuthProvider
    state: string
    code?: string
    error?: string
  },
  now: () => Date,
): Promise<ReceiveOAuthAuthorizationCallbackResult> {
  if (!options.state) throw createHttpError(400, 'OAuth callback is invalid')
  if (!options.code && !options.error) throw createHttpError(400, 'OAuth callback is invalid')

  await using query = await beginTransaction()
  const result = await receiveCallbackInTransaction()
  await query.commit()
  if ('expired' in result) throw createHttpError(410, 'OAuth authorization expired')
  return result

  async function receiveCallbackInTransaction(): Promise<ReceiveOAuthAuthorizationCallbackTransactionResult> {
    const { rows: selected } = await query<{ id: string }>(
      `/* receiveOAuthAuthorizationCallback:lock */ SELECT id
       FROM oauth_authorizations
       WHERE state_hash = $1 AND provider = $2
       FOR UPDATE`,
      [hashOAuthAuthorizationState(options.state), options.provider],
    )
    if (!selected[0]) throw createHttpError(400, 'OAuth callback is invalid')
    // A fresh statement sees any callback committed while this transaction waited for the lock.
    const { rows } = await query(
      `/* receiveOAuthAuthorizationCallback */ SELECT *
       FROM view_oauth_authorization_current_records WHERE id = $1`,
      [selected[0].id],
    )
    const authorization = rows[0] as OAuthAuthorizationRow | undefined
    if (!authorization) throw createHttpError(400, 'OAuth callback is invalid')
    const decisionAtMs = now().getTime()
    if (!Number.isFinite(decisionAtMs)) throw new RangeError('Invalid OAuth callback time')
    if (authorization.expires_at.getTime() <= decisionAtMs) {
      if (authorization.status !== 'completed') {
        await query(
          `/* receiveOAuthAuthorizationCallback */ UPDATE oauth_authorizations
           SET expired_at = CASE WHEN rejected_at IS NULL THEN COALESCE(expired_at, clock_timestamp()) ELSE expired_at END,
               callback_code_ciphertext = NULL,
               completion_token_ciphertext = NULL
           WHERE id = $1`,
          [authorization.id],
        )
      }
      return { expired: true }
    }

    if (authorization.status !== 'pending')
      return getExistingCallbackHandoff(authorization, options)

    const completionToken = randomBytes(32).toString('base64url')
    if (options.error) {
      await query(
        `/* receiveOAuthAuthorizationCallback */ UPDATE oauth_authorizations
         SET rejected_at = COALESCE(rejected_at, clock_timestamp()),
             callback_error = $2,
             callback_error_hash = $3,
             completion_token_hash = $4,
             completion_token_ciphertext = $5,
             callback_received_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          authorization.id,
          normalizeCallbackError(options.error),
          hashOAuthCallbackError(authorization.id, options.error),
          hashOAuthCompletionToken(authorization.id, completionToken),
          encryptSecret(completionToken, getCompletionTokenPurpose(authorization.id)),
        ],
      )
      return handoff(authorization, completionToken, false)
    }

    await query(
      `/* receiveOAuthAuthorizationCallback */ UPDATE oauth_authorizations
       SET callback_code_ciphertext = $2,
           callback_code_hash = $3,
           completion_token_hash = $4,
           completion_token_ciphertext = $5,
           callback_received_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        authorization.id,
        encryptSecret(options.code!, getCallbackCodePurpose(authorization.id)),
        hashOAuthCallbackCode(authorization.id, options.code!),
        hashOAuthCompletionToken(authorization.id, completionToken),
        encryptSecret(completionToken, getCompletionTokenPurpose(authorization.id)),
      ],
    )
    return handoff(authorization, completionToken, true)
  }
}

export function decryptOAuthAuthorizationCode(flowId: string, ciphertext: string): string {
  return decryptSecret(ciphertext, getCallbackCodePurpose(flowId))
}

export function decryptOAuthAuthorizationPkceVerifier(flowId: string, ciphertext: string): string {
  return decryptSecret(ciphertext, getPkceVerifierPurpose(flowId))
}
