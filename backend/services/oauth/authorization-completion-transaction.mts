import { beginTransaction } from '@data-stores/psql'
import { connectOAuthAccountToUser } from '@services/oauth-accounts'
import { preparePersistedOAuthAccountFlow } from './flows.mts'
import {
  assertCompletionCaller,
  getAuthorizationAccount,
  getAuthorizationForCompletion,
  getStoredCompletionResult,
  persistCompletionResult,
} from './authorization-completion-persistence.mts'
import type {
  DurableOAuthAuthorizationCompletion,
  OAuthAuthorizationCompletionOptions,
} from './authorization-completion-types.mts'
import createHttpError from 'http-errors'
import { validate as uuidValidate, v7 as uuidv7, version as uuidVersion } from 'uuid'

type CompletionTransactionResult = DurableOAuthAuthorizationCompletion | { kind: 'expired' }

export async function completeOAuthAuthorizationTransaction(
  options: OAuthAuthorizationCompletionOptions,
): Promise<DurableOAuthAuthorizationCompletion> {
  await using query = await beginTransaction()
  const result: CompletionTransactionResult = await completeAuthorizationInTransaction()
  await query.commit()
  if (result.kind === 'expired') throw createHttpError(410, 'OAuth authorization expired')
  return result

  async function completeAuthorizationInTransaction(): Promise<CompletionTransactionResult> {
    const authorization = await getAuthorizationForCompletion(options.flowId, query)
    assertCompletionCaller(authorization, options)

    if (authorization.expires_at.getTime() <= Date.now()) {
      if (authorization.status !== 'completed') {
        await query(
          `/* completeOAuthAuthorization */ UPDATE oauth_authorizations
           SET status = 'expired',
               callback_code_ciphertext = NULL,
               completion_token_ciphertext = NULL,
               exchange_claim_id = NULL
           WHERE id = $1`,
          [authorization.id],
        )
      }
      return { kind: 'expired' as const }
    }
    if (authorization.status === 'rejected') {
      throw createHttpError(401, authorization.callback_error || 'OAuth authorization rejected')
    }
    if (authorization.status === 'expired') {
      throw createHttpError(410, 'OAuth authorization expired')
    }
    if (['pending', 'callback_received', 'exchanging'].includes(authorization.status)) {
      return { kind: 'pending' }
    }
    if (authorization.status === 'completed') {
      const stored = getStoredCompletionResult(authorization)
      if (stored.kind === 'authenticated') return { ...stored, newlyCompleted: false }
      if (stored.kind === 'mfa_required') return stored
      return {
        ...stored,
        account: await getAuthorizationAccount(authorization, query),
        provider: authorization.provider,
        newlyCompleted: false,
      }
    }

    const account = await getAuthorizationAccount(authorization, query)
    if (authorization.purpose === 'connect') {
      const userId = authorization.initiating_user_id!
      await connectOAuthAccountToUser(authorization.provider, userId, account.provider_user_id, {
        query,
      })
      await persistCompletionResult(authorization.id, { kind: 'connected', userId }, query)
      return {
        kind: 'connected',
        userId,
        account,
        provider: authorization.provider,
        newlyCompleted: true,
      }
    }

    const result = await preparePersistedOAuthAccountFlow({
      provider: authorization.provider,
      account,
      deviceId: options.deviceId,
      sessionId: options.sessionId,
      deviceClass: options.deviceClass,
      deviceContext: options.deviceContext,
      loginAttemptId: uuidv7(),
    })
    if (result.mfaRequired) {
      const durableResult = {
        kind: 'mfa_required' as const,
        userId: result.userId,
        loginAttemptId: result.loginAttemptId,
      }
      await persistCompletionResult(authorization.id, durableResult, query)
      return durableResult
    }

    const durableResult = {
      kind: 'authenticated' as const,
      userId: result.user.id,
      deviceId: durableDeviceId(authorization.initiating_device_id),
      sessionId: uuidv7(),
    }
    await persistCompletionResult(authorization.id, durableResult, query)
    return { ...durableResult, newlyCompleted: true }
  }
}

function durableDeviceId(initiatingDeviceId: string): string {
  return uuidValidate(initiatingDeviceId) && uuidVersion(initiatingDeviceId) === 7
    ? initiatingDeviceId
    : uuidv7()
}
