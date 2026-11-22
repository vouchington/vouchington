import { revokeOtherAuthenticatedSessions } from '@services/jwt-session/user-session-revocation'
import { assertBrokerProviderReAuthAccount } from './provider-reauth-broker.mts'
import {
  assertReadableAccountSession,
  lockLiveAccountSession,
} from '@services/mfa/active-account-session'
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
import { readStoredCompletionReplay } from './authorization-completion-replay.mts'
import { preparePersistedOAuthAccountFlow, enqueueOAuthFriendSyncBestEffort } from './flows.mts'
import {
  assertCompletionCaller,
  expireUncompletedAuthorization,
  getAuthorizationAccount,
  getAuthorizationForCompletion,
  readAuthorizationForCompletion,
  persistCompletionResult,
} from './authorization-completion-persistence.mts'
import type {
  CompletionRow,
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
  const observed = await readAuthorizationForCompletion(options.flowId, query)
  assertCompletionCaller(observed, options)
  const result =
    observed.status === 'completion_ready' && observed.expires_at > new Date()
      ? await completeWithWriterAuthority()
      : await completeWithReadAuthority(observed)
  await query.commit()
  if (result.kind === 'expired') throw createHttpError(410, 'OAuth authorization expired')
  return result

  async function completeWithWriterAuthority(): Promise<CompletionTransactionResult> {
    const lockedActor = options.currentUserId
      ? await lockLiveAccountSession(
          options.currentUserId,
          { sid: options.sessionId, did: options.deviceId },
          query,
        )
      : undefined
    const authorization = await getAuthorizationForCompletion(options.flowId, query, new Date())
    if (!authorization) {
      const current = await readAuthorizationForCompletion(options.flowId, query)
      assertCompletionCaller(current, options)
      return completeWithReadAuthority(current)
    }
    assertCompletionCaller(authorization, options)
    return completeAuthorizationInTransaction(authorization, new Date(), { lockedActor })
  }

  async function completeWithReadAuthority(
    authorization: CompletionRow,
  ): Promise<CompletionTransactionResult> {
    if (options.currentUserId)
      await assertReadableAccountSession(
        options.currentUserId,
        { sid: options.sessionId, did: options.deviceId },
        query,
        authorization.purpose !== 'authenticate',
      )
    return completeAuthorizationInTransaction(authorization, new Date())
  }

  async function completeAuthorizationInTransaction(
    authorization: CompletionRow,
    decisionAt: Date,
    writer?: { lockedActor?: LockedOAuthAccountConnectionUser },
  ): Promise<CompletionTransactionResult> {
    const activeConnectionUser =
      writer?.lockedActor && authorization.purpose !== 'authenticate'
        ? await assertLockedOAuthAccountConnectionUserActive(writer.lockedActor)
        : null

    if (authorization.expires_at <= decisionAt) {
      if (authorization.status !== 'completed')
        await expireUncompletedAuthorization(authorization.id, decisionAt, query)
      return { kind: 'expired' as const }
    }
    if (authorization.status === 'rejected')
      throw createHttpError(401, authorization.callback_error || 'OAuth authorization rejected')
    if (authorization.status === 'expired')
      throw createHttpError(410, 'OAuth authorization expired')
    if (['pending', 'callback_received', 'exchanging'].includes(authorization.status))
      return { kind: 'pending' }
    if (authorization.status === 'completed')
      return readStoredCompletionReplay(authorization, query)

    if (!writer) throw createHttpError(409, 'OAuth authorization could not be completed')
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

    const accountFlow = await preparePersistedOAuthAccountFlow({
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
    if (accountFlow.mfaRequired) {
      const durableResult = {
        kind: 'mfa_required' as const,
        userId: accountFlow.userId,
        loginAttemptId: accountFlow.loginAttemptId,
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
      userId: accountFlow.user.id,
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
