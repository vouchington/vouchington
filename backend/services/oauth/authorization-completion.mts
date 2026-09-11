import { runOAuthAccountConnectionPostCommitEffects } from '@services/oauth-accounts'
import onError from '@modules/on-error'
import { createOAuthFlowResultForUser, enqueueOAuthFriendSyncBestEffort } from './flows.mts'
import {
  getOAuthAccountName,
  requireCompletionUser,
} from './authorization-completion-persistence.mts'
import { completeOAuthAuthorizationTransaction } from './authorization-completion-transaction.mts'
import type {
  CompletedOAuthAuthorization,
  OAuthAuthorizationCompletionOptions,
} from './authorization-completion-types.mts'

type OAuthAuthorizationCompletionDependencies = {
  completeTransaction: typeof completeOAuthAuthorizationTransaction
  createFlowResult: typeof createOAuthFlowResultForUser
  enqueueFriendSync: typeof enqueueOAuthFriendSyncBestEffort
  requireUser: typeof requireCompletionUser
  runConnectionEffects: typeof runOAuthAccountConnectionPostCommitEffects
}

const defaultDependencies: OAuthAuthorizationCompletionDependencies = {
  completeTransaction: completeOAuthAuthorizationTransaction,
  createFlowResult: createOAuthFlowResultForUser,
  enqueueFriendSync: enqueueOAuthFriendSyncBestEffort,
  requireUser: requireCompletionUser,
  runConnectionEffects: runOAuthAccountConnectionPostCommitEffects,
}

export async function completeOAuthAuthorization(
  options: OAuthAuthorizationCompletionOptions,
  dependencies: OAuthAuthorizationCompletionDependencies = defaultDependencies,
): Promise<CompletedOAuthAuthorization> {
  const durableResult = await dependencies.completeTransaction(options)
  if (durableResult.kind === 'pending') return { status: 'pending' }
  if (durableResult.kind === 'connected') {
    if (durableResult.newlyCompleted) {
      try {
        await dependencies.runConnectionEffects(durableResult.userId)
      } catch (error) {
        reportPostCommitError(error)
      }
      try {
        await dependencies.enqueueFriendSync(
          durableResult.provider,
          durableResult.account.provider_user_id,
        )
      } catch (error) {
        reportPostCommitError(error)
      }
    }
    return {
      status: 'connected',
      account: durableResult.account,
      name: getOAuthAccountName(durableResult.account),
    }
  }
  if (durableResult.kind === 'mfa_required') {
    return { status: 'mfa_required', loginAttemptId: durableResult.loginAttemptId }
  }
  const user = await dependencies.requireUser(durableResult.userId)
  const result = await dependencies.createFlowResult({
    user,
    deviceId: durableResult.deviceId,
    sessionId: options.sessionId,
    authenticatedSessionId: durableResult.sessionId,
    refreshAuthenticatedSession: !durableResult.newlyCompleted,
    deviceClass: options.deviceClass,
    deviceContext: options.deviceContext,
  })
  if (result.mfaRequired) {
    throw new Error('Stored OAuth authentication result unexpectedly requires MFA')
  }
  return {
    status: 'authenticated',
    user: result.user,
    deviceToken: result.deviceToken,
    sessionToken: result.sessionToken,
  }
}

function reportPostCommitError(error: unknown): void {
  onError(error instanceof Error ? error : new Error(String(error)))
}
