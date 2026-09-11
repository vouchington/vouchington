import { randomBytes } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import type { BrokerCallbackMode, BrokerOAuthProvider, BrokerPurpose } from './broker-config.mts'
import {
  getCallbackCodePurpose,
  getCompletionTokenPurpose,
  getPkceVerifierPurpose,
  hashOAuthAuthorizationState,
  hashOAuthCompletionToken,
} from './authorization-secrets.mts'

type OAuthAuthorizationRow = {
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

export async function receiveOAuthAuthorizationCallback(options: {
  provider: BrokerOAuthProvider
  state: string
  code?: string
  error?: string
}): Promise<ReceiveOAuthAuthorizationCallbackResult> {
  if (!options.state) throw createHttpError(400, 'OAuth callback is invalid')
  if (!options.code && !options.error) throw createHttpError(400, 'OAuth callback is invalid')

  await using query = await beginTransaction()
  const result = await receiveCallbackInTransaction()
  await query.commit()
  if ('expired' in result) throw createHttpError(410, 'OAuth authorization expired')
  return result

  async function receiveCallbackInTransaction(): Promise<ReceiveOAuthAuthorizationCallbackTransactionResult> {
    const { rows } = await query(
      `/* receiveOAuthAuthorizationCallback */ SELECT *
       FROM oauth_authorizations
       WHERE state_hash = $1 AND provider = $2
       FOR UPDATE`,
      [hashOAuthAuthorizationState(options.state), options.provider],
    )
    const authorization = rows[0] as OAuthAuthorizationRow | undefined
    if (!authorization) throw createHttpError(400, 'OAuth callback is invalid')
    if (authorization.expires_at.getTime() <= Date.now()) {
      if (authorization.status !== 'completed') {
        await query(
          `/* receiveOAuthAuthorizationCallback */ UPDATE oauth_authorizations
           SET status = 'expired',
               callback_code_ciphertext = NULL,
               completion_token_ciphertext = NULL
           WHERE id = $1`,
          [authorization.id],
        )
      }
      return { expired: true }
    }

    if (authorization.status !== 'pending') return getExistingCallbackHandoff(authorization)

    const completionToken = randomBytes(32).toString('base64url')
    if (options.error) {
      await query(
        `/* receiveOAuthAuthorizationCallback */ UPDATE oauth_authorizations
         SET status = 'rejected',
             callback_error = $2,
             completion_token_hash = $3,
             completion_token_ciphertext = $4,
             callback_received_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          authorization.id,
          normalizeCallbackError(options.error),
          hashOAuthCompletionToken(authorization.id, completionToken),
          encryptSecret(completionToken, getCompletionTokenPurpose(authorization.id)),
        ],
      )
      return handoff(authorization, completionToken, false)
    }

    await query(
      `/* receiveOAuthAuthorizationCallback */ UPDATE oauth_authorizations
       SET status = 'callback_received',
           callback_code_ciphertext = $2,
           completion_token_hash = $3,
           completion_token_ciphertext = $4,
           callback_received_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        authorization.id,
        encryptSecret(options.code!, getCallbackCodePurpose(authorization.id)),
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

function handoff(
  authorization: OAuthAuthorizationRow,
  completionToken: string,
  exchangeRequired: boolean,
): ReceiveOAuthAuthorizationCallbackResult {
  return {
    flowId: authorization.id,
    callbackMode: authorization.callback_mode,
    completionToken,
    exchangeRequired,
    expiresAt: authorization.expires_at,
  }
}

function getExistingCallbackHandoff(
  authorization: OAuthAuthorizationRow,
): ReceiveOAuthAuthorizationCallbackResult {
  if (
    !['callback_received', 'exchanging', 'completion_ready', 'rejected'].includes(
      authorization.status,
    ) ||
    !authorization.completion_token_ciphertext
  ) {
    throw createHttpError(409, 'OAuth authorization cannot be resumed')
  }
  return handoff(
    authorization,
    decryptSecret(
      authorization.completion_token_ciphertext,
      getCompletionTokenPurpose(authorization.id),
    ),
    authorization.status !== 'rejected',
  )
}

function normalizeCallbackError(error: string): string {
  const normalized = error.replaceAll(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 128)
  return normalized || 'provider_rejected'
}
