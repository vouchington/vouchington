import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { upsertOAuthAccount } from '@services/oauth-accounts'
import {
  deleteTestOAuthAuthorizationFixtures,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'

export type CompletionTestCleanup = {
  authorizationIds: string[]
  githubUserIds: string[]
  facebookUserIds: string[]
  userIds: string[]
}

export function registerCleanup(): CompletionTestCleanup {
  const cleanup: CompletionTestCleanup = {
    authorizationIds: [],
    githubUserIds: [],
    facebookUserIds: [],
    userIds: [],
  }
  onTestFinished(async () => {
    await deleteTestOAuthAuthorizationFixtures(cleanup)
  })
  return cleanup
}

export async function createOAuthAccount(
  provider: 'facebook' | 'github',
  cleanup: CompletionTestCleanup,
) {
  const providerUserId = `broker-completion-${randomUUID()}`
  if (provider === 'github') cleanup.githubUserIds.push(providerUserId)
  else cleanup.facebookUserIds.push(providerUserId)
  return upsertOAuthAccount(provider, providerUserId, `tests+${providerUserId}@voucha.ai`, {
    login: providerUserId,
    name: 'Broker Completion',
  })
}

export async function insertCompletionReadyAuthorization(
  options: {
    accountId: string
    provider: 'facebook' | 'github'
    deviceId: string
    sessionId: string
    completionToken: string
    purpose: 'authenticate' | 'connect'
    callbackMode: 'web' | 'native'
    initiatingUserId?: string
    proofChallenge?: string
  },
  cleanup: CompletionTestCleanup,
): Promise<string> {
  const now = new Date()
  const flowId = await insertTestOAuthAuthorization({
    provider: options.provider,
    purpose: options.purpose,
    callbackMode: options.callbackMode,
    status: 'completion_ready',
    initiatingUserId: options.initiatingUserId,
    deviceId: options.deviceId,
    sessionId: options.sessionId,
    completionProofChallenge: options.proofChallenge,
    completionToken: options.completionToken,
    completionTokenCiphertext: 'test-completion-token-ciphertext',
    providerUserId: options.accountId,
    callbackReceivedAt: now,
    completionReadyAt: now,
  })
  cleanup.authorizationIds.push(flowId)
  return flowId
}
