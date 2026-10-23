import onError from '@modules/on-error'
import type { DeviceClass, DeviceContext } from '@services/jwt-session'
import { upsertUser } from '@services/users/create'
import {
  enqueueSyncFacebookFriends,
  enqueueSyncGithubFriends,
  enqueueSyncXFriends,
} from '@queues/find-your-friends/enqueues'
import type { OAuthAccount, OAuthProvider } from './providers.mts'
import { connectOAuthAccountToUser } from './connect.mts'
import { runOAuthAccountConnectionPostCommitEffects } from '@services/oauth-accounts'
import { upsertProviderAccount } from './upsert-provider-account.mts'
import {
  issuePreparedOAuthFlowResult,
  prepareOAuthFlowResultForUser,
  type OAuthFlowResult,
} from './oauth-flow-result.mts'

export { createOAuthFlowResultForUser, type OAuthFlowResult } from './oauth-flow-result.mts'

export async function connectOAuthAccountFlow(options: {
  provider: OAuthProvider
  currentUserId: string
  body: Record<string, unknown>
  expectedOrigin?: string
}) {
  const { account, name } = await upsertProviderAccount(
    options.provider,
    options.body,
    options.expectedOrigin,
    { requireAppleVerifiedEmail: false },
  )

  await connectPersistedOAuthAccountFlow({
    provider: options.provider,
    currentUserId: options.currentUserId,
    account,
  })

  return { account, name }
}

export async function connectPersistedOAuthAccountFlow(options: {
  provider: OAuthProvider
  currentUserId: string
  account: OAuthAccount
}): Promise<void> {
  await connectOAuthAccountAndRunPostCommitEffects(options)
  await enqueueOAuthFriendSyncBestEffort(options.provider, options.account)
}

async function connectOAuthAccountAndRunPostCommitEffects(options: {
  provider: OAuthProvider
  currentUserId: string
  account: OAuthAccount
}): Promise<void> {
  await connectOAuthAccountToUser(
    options.provider,
    options.currentUserId,
    options.account.provider_user_id,
  )
  await runOAuthAccountConnectionPostCommitEffects(options.currentUserId)
}

export async function continueOAuthFlow(options: {
  provider: OAuthProvider
  body: Record<string, unknown>
  expectedOrigin?: string
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
}): Promise<OAuthFlowResult> {
  const { account } = await upsertProviderAccount(
    options.provider,
    options.body,
    options.expectedOrigin,
  )

  return continuePersistedOAuthAccountFlow({ ...options, account })
}

export async function continuePersistedOAuthAccountFlow(options: {
  provider: OAuthProvider
  account: OAuthAccount
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  loginAttemptId?: string
  authOrigin?: 'web' | 'native'
}): Promise<OAuthFlowResult> {
  const result = await preparePersistedOAuthAccountFlow(options)
  if (result.mfaRequired) {
    return { mfaRequired: true, loginAttemptId: result.loginAttemptId }
  }
  return issuePreparedOAuthFlowResult({ ...options, ...result })
}

export async function preparePersistedOAuthAccountFlow(options: {
  provider: OAuthProvider
  account: OAuthAccount
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  loginAttemptId?: string
  authOrigin?: 'web' | 'native'
}) {
  await enqueueOAuthFriendSyncBestEffort(options.provider, options.account)
  return prepareOAuthFlowResultWithPersistedOwner(options)
}

async function prepareOAuthFlowResultWithPersistedOwner(options: {
  provider: OAuthProvider
  account: OAuthAccount
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  loginAttemptId?: string
  authOrigin?: 'web' | 'native'
}) {
  const user = await upsertUser({
    oauthAccount: { provider: options.provider, account: options.account },
    deviceId: options.deviceId,
    sessionId: options.sessionId,
    ipAddress: options.deviceContext?.ip_address,
    userAgent: options.deviceContext?.user_agent,
  })

  const result = await prepareOAuthFlowResultForUser({ ...options, user })
  return result.mfaRequired ? { ...result, userId: user.id } : result
}

export async function enqueueOAuthFriendSyncBestEffort(
  provider: OAuthProvider,
  account: OAuthAccount,
): Promise<void> {
  try {
    switch (provider) {
      case 'facebook':
        await enqueueSyncFacebookFriends(requireFriendSyncAccountId(account))
        return
      case 'x':
        await enqueueSyncXFriends(requireFriendSyncAccountId(account))
        return
      case 'github':
        await enqueueSyncGithubFriends(requireFriendSyncAccountId(account))
        break
      default:
        break
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

function requireFriendSyncAccountId(account: OAuthAccount): string {
  if (!account.account_id) throw new Error('OAuth friend sync account has no internal id')
  return account.account_id
}
