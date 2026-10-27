import { revokeOtherAuthenticatedSessions } from '@services/jwt-session/user-session-revocation'
import { assertBrokerProviderReAuthAccount } from './provider-reauth-broker.mts'
import { lockLiveAccountSession } from '@services/mfa/active-account-session'
import {
  beginTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
import { captureAccountSecurityAddress } from '@services/mfa/account-change'
import {
  connectOAuthAccountToActiveUser,
  assertLockedOAuthAccountConnectionUserActive,
  type LockedOAuthAccountConnectionUser,
} from '@services/oauth-accounts'
import { preparePersistedOAuthAccountFlow, enqueueOAuthFriendSyncBestEffort } from './flows.mts'
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
  let lockedActor: LockedOAuthAccountConnectionUser | undefined
  if (options.currentUserId) {
    lockedActor = await lockLiveAccountSession(
      options.currentUserId,
      { sid: options.sessionId, did: options.deviceId },
      query,
    )
  }
  const result: CompletionTransactionResult = await completeAuthorizationInTransaction()
  await query.commit()
  if (result.kind === 'expired') throw createHttpError(410, 'OAuth authorization expired')
  return result

  async function completeAuthorizationInTransaction(): Promise<CompletionTransactionResult> {
    const authorization = await getAuthorizationForCompletion(options.flowId, query)
    assertCompletionCaller(authorization, options)
    const activeConnectionUser =
      authorization.purpose !== 'authenticate'
        ? await assertLockedOAuthAccountConnectionUserActive(lockedActor!)
        : null

    if (authorization.expires_at.getTime() <= Date.now()) {
      if (authorization.status !== 'completed') {
        await query(
          `/* completeOAuthAuthorization */ UPDATE oauth_authorizations
           SET expired_at = CASE WHEN rejected_at IS NULL THEN COALESCE(expired_at, clock_timestamp()) ELSE expired_at END,
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
      if (stored.kind === 'authenticated') {
        const account = await getAuthorizationAccount(authorization, query)
        return {
          ...stored,
          newlyCompleted: false,
          firstFactor: {
            type: 'provider',
            provider: authorization.provider,
            providerUserId: account.provider_user_id,
          },
        }
      }
      if (stored.kind === 'mfa_required') return stored
      if (authorization.purpose === 're_auth') {
        return {
          kind: 'reauthenticated',
          account: await getAuthorizationAccount(authorization, query),
        }
      }
      return {
        ...stored,
        account: await getAuthorizationAccount(authorization, query),
        provider: authorization.provider,
        newlyCompleted: false,
      }
    }

    const account = await getAuthorizationAccount(authorization, query)
    if (authorization.purpose === 're_auth') {
      await assertBrokerProviderReAuthAccount(authorization, account, query)
      await persistCompletionResult(
        authorization.id,
        { kind: 'connected', userId: activeConnectionUser!.userId },
        query,
      )
      return { kind: 'reauthenticated', account }
    }
    if (activeConnectionUser) {
      const userId = activeConnectionUser.userId
      const connectionChanged = account.user_id !== userId
      const notificationEmailAddress = connectionChanged
        ? await captureAccountSecurityAddress(userId, { query })
        : undefined
      if (connectionChanged) {
        await attachProviderAccountAndRevokeOthers(
          authorization.provider,
          activeConnectionUser,
          account.provider_user_id,
          options.sessionId,
          query,
        )
      }
      await persistCompletionResult(authorization.id, { kind: 'connected', userId }, query)
      return {
        kind: 'connected',
        userId,
        notificationEmailAddress,
        account,
        provider: authorization.provider,
        newlyCompleted: connectionChanged,
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
      authOrigin: authorization.callback_mode,
    })
    registerPostCommitAction(query, () =>
      enqueueOAuthFriendSyncBestEffort(authorization.provider, account),
    )
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
      firstFactor: {
        type: 'provider' as const,
        provider: authorization.provider,
        providerUserId: account.provider_user_id,
      },
      userId: result.user.id,
      deviceId: durableDeviceId(authorization.initiating_device_id),
      sessionId: uuidv7(),
      authOrigin: authorization.callback_mode,
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

async function attachProviderAccountAndRevokeOthers(
  provider: Parameters<typeof connectOAuthAccountToActiveUser>[0],
  activeConnectionUser: Parameters<typeof connectOAuthAccountToActiveUser>[1],
  providerUserId: string,
  sessionId: string,
  query: TransactionQuery,
): Promise<void> {
  await revokeOtherAuthenticatedSessions(activeConnectionUser.userId, sessionId, { query })
  await connectOAuthAccountToActiveUser(provider, activeConnectionUser, providerUserId)
}
