import { runOAuthAccountConnectionPostCommitEffects } from '@services/oauth-accounts'
import onError from '@modules/on-error'
import { notifyAccountSecurityChange } from '@services/mfa/account-change'
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

export async function completeOAuthAuthorization(
  options: OAuthAuthorizationCompletionOptions,
): Promise<CompletedOAuthAuthorization> {
  const durableResult = await completeOAuthAuthorizationTransaction(options)
  if (durableResult.kind === 'pending') return { status: 'pending' }
  if (durableResult.kind === 'reauthenticated') {
    return {
      status: 'connected',
      account: durableResult.account,
      name: getOAuthAccountName(durableResult.account),
    }
  }
  if (durableResult.kind === 'connected') {
    if (durableResult.newlyCompleted) {
      try {
        await notifyAccountSecurityChange(durableResult.notificationEmailAddress)
      } catch (err) {
        reportPostCommitError(err)
      }
      // Reports its own failures, so it never rejects.
      await runOAuthAccountConnectionPostCommitEffects(durableResult.userId)
      // Reports its own failures, so it never rejects.
      await enqueueOAuthFriendSyncBestEffort(durableResult.provider, durableResult.account)
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
  const user = await requireCompletionUser(durableResult.userId)
  const result = await createOAuthFlowResultForUser({
    user,
    firstFactor: durableResult.firstFactor,
    deviceId: durableResult.deviceId,
    sessionId: options.sessionId,
    authenticatedSessionId: durableResult.sessionId,
    refreshAuthenticatedSession: !durableResult.newlyCompleted,
    deviceClass: options.deviceClass,
    deviceContext: options.deviceContext,
    authOrigin: durableResult.authOrigin,
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
