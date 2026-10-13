import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import type { PrivateUser } from '../services/users/types.mts'
import type { completeOAuthAuthorization } from '../services/oauth/authorization-completion.mts'
import type { OAuthAuthorizationCompletionOptions } from '../services/oauth/authorization-completion-types.mts'
import type { OAuthFlowResult } from '../services/oauth/flows.mts'

export type CompletionDependencies = NonNullable<Parameters<typeof completeOAuthAuthorization>[1]>

export function completionOptions(
  overrides: Partial<OAuthAuthorizationCompletionOptions> = {},
): OAuthAuthorizationCompletionOptions {
  return {
    flowId: randomUUID(),
    completionToken: 'completion-token',
    completionTokenSource: 'cookie',
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    ...overrides,
  }
}

export function authenticatedFlowResult(
  user: PrivateUser,
  deviceId: string,
  sessionId: string,
): Extract<OAuthFlowResult, { mfaRequired: false }> {
  return {
    mfaRequired: false,
    user,
    deviceToken: { token: 'fixture-device-token', payload: { did: deviceId } },
    sessionToken: {
      token: 'fixture-session-token',
      payload: { did: deviceId, sid: sessionId, uid: user.id },
    },
  }
}

export function completionDependencies(
  durableResult: Awaited<ReturnType<CompletionDependencies['completeTransaction']>>,
  user?: PrivateUser,
): CompletionDependencies {
  return {
    completeTransaction: vi.fn<CompletionDependencies['completeTransaction']>(() =>
      Promise.resolve(durableResult),
    ),
    createFlowResult: vi.fn<CompletionDependencies['createFlowResult']>(),
    enqueueFriendSync: vi.fn<CompletionDependencies['enqueueFriendSync']>(() => Promise.resolve()),
    requireUser: vi.fn<CompletionDependencies['requireUser']>(() =>
      user ? Promise.resolve(user) : Promise.reject(new Error('Unexpected completion user lookup')),
    ),
    runConnectionEffects: vi.fn<CompletionDependencies['runConnectionEffects']>(() =>
      Promise.resolve(),
    ),
  }
}
