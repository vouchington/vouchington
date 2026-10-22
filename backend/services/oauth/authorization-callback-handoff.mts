import { decryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import { safeEqual } from './authorization-completion-proof.mts'
import {
  getCompletionTokenPurpose,
  hashOAuthCallbackCode,
  hashOAuthCallbackError,
} from './authorization-secrets.mts'
import type {
  OAuthAuthorizationRow,
  ReceiveOAuthAuthorizationCallbackResult,
} from './authorization-callback.mts'

export function handoff(
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

export function getExistingCallbackHandoff(
  authorization: OAuthAuthorizationRow,
  options: { code?: string; error?: string },
): ReceiveOAuthAuthorizationCallbackResult {
  if (
    !['callback_received', 'exchanging', 'completion_ready', 'rejected'].includes(
      authorization.status,
    ) ||
    !authorization.completion_token_ciphertext
  ) {
    throw createHttpError(409, 'OAuth authorization cannot be resumed')
  }
  const sameCode =
    options.code !== undefined &&
    authorization.callback_code_hash !== null &&
    safeEqual(
      authorization.callback_code_hash,
      hashOAuthCallbackCode(authorization.id, options.code),
    )
  const sameError =
    options.error !== undefined &&
    authorization.callback_error_hash !== null &&
    authorization.callback_error === normalizeCallbackError(options.error) &&
    safeEqual(
      authorization.callback_error_hash,
      hashOAuthCallbackError(authorization.id, options.error),
    )
  if (!sameCode && !sameError) throw createHttpError(409, 'OAuth callback does not match')
  return handoff(
    authorization,
    decryptSecret(
      authorization.completion_token_ciphertext,
      getCompletionTokenPurpose(authorization.id),
    ),
    authorization.status !== 'rejected',
  )
}

export function normalizeCallbackError(error: string): string {
  const normalized = error.replaceAll(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 128)
  return normalized || 'provider_rejected'
}
