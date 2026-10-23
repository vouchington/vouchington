import type { PreparedOAuthAccount } from '@services/oauth-accounts/reauthentication'
import {
  runWithTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
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
  createOAuthFlowResultForUser,
  prepareOAuthFlowResultForUser,
  type OAuthFlowResult,
} from './oauth-flow-result.mts'

export { createOAuthFlowResultForUser, type OAuthFlowResult } from './oauth-flow-result.mts'

export async function connectOAuthAccountFlow(options: {
  provider: OAuthProvider
  currentUserId: string
  prepared: PreparedOAuthAccount
  query?: TransactionQuery
}) {
  return runWithTransaction(options.query, async query => {
    const account = await options.prepared.persist({ query })
    const name =
      typeof account.provider_user_data.name === 'string' ? account.provider_user_data.name : ''

    await connectPersistedOAuthAccountFlow({
      provider: options.provider,
      currentUserId: options.currentUserId,
      account,
      query,
    })

    return { account, name }
  })
}

export async function connectPersistedOAuthAccountFlow(options: {
  provider: OAuthProvider
  currentUserId: string
  account: OAuthAccount
  query?: TransactionQuery
}): Promise<void> {
  await runWithTransaction(options.query, async query => {
    await connectOAuthAccountAndRunPostCommitEffects({ ...options, query })
    registerPostCommitAction(query, () =>
      enqueueOAuthFriendSyncBestEffort(options.provider, options.account),
    )
  })
}

async function connectOAuthAccountAndRunPostCommitEffects(options: {
  provider: OAuthProvider
  currentUserId: string
  account: OAuthAccount
  query: TransactionQuery
}): Promise<void> {
  await connectOAuthAccountToUser(
    options.provider,
    options.currentUserId,
    options.account.provider_user_id,
    { query: options.query },
  )
  registerPostCommitAction(options.query, () =>
    runOAuthAccountConnectionPostCommitEffects(options.currentUserId),
  )
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
}): Promise<OAuthFlowResult> {
  const result = await preparePersistedAuthenticationResult(options)
  await enqueueOAuthFriendSyncBestEffort(options.provider, options.account)
  return result
}

export async function preparePersistedOAuthAccountFlow(options: {
  provider: OAuthProvider
  account: OAuthAccount
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  loginAttemptId?: string
}) {
  const user = await upsertPersistedOAuthAccountUser(options)
  const result = await prepareOAuthFlowResultForUser({
    ...options,
    user,
    firstFactor: {
      type: 'provider',
      provider: options.provider,
      providerUserId: options.account.provider_user_id,
    },
  })
  return result.mfaRequired ? { ...result, userId: user.id } : result
}

async function upsertPersistedOAuthAccountUser(options: {
  provider: OAuthProvider
  account: OAuthAccount
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  loginAttemptId?: string
}) {
  const user = await upsertUser({
    oauthAccount: { provider: options.provider, account: options.account },
    deviceId: options.deviceId,
    sessionId: options.sessionId,
    ipAddress: options.deviceContext?.ip_address,
    userAgent: options.deviceContext?.user_agent,
  })

  return user
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

async function preparePersistedAuthenticationResult(
  options: Parameters<typeof continuePersistedOAuthAccountFlow>[0],
): Promise<OAuthFlowResult> {
  const user = await upsertPersistedOAuthAccountUser(options)
  return createOAuthFlowResultForUser({
    ...options,
    user,
    firstFactor: {
      type: 'provider',
      provider: options.provider,
      providerUserId: options.account.provider_user_id,
    },
  })
}
