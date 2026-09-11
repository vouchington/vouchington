import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import type { OAuthAuthorizationCompletionOptions } from '../authorization-completion-types.mts'

type CompletionDependencies = NonNullable<Parameters<typeof completeOAuthAuthorization>[1]>

describe('OAuth authorization completion orchestration', () => {
  it('uses the durable authenticated session for first issuance and replay', async () => {
    const userId = randomUUID()
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const options = completionOptions()
    const firstDependencies = completionDependencies({
      kind: 'authenticated',
      userId,
      deviceId,
      sessionId,
      newlyCompleted: true,
    })
    const replayDependencies = completionDependencies({
      kind: 'authenticated',
      userId,
      deviceId,
      sessionId,
      newlyCompleted: false,
    })
    const authenticatedResult = {
      mfaRequired: false,
      user: { id: userId },
      deviceToken: {},
      sessionToken: {},
    } as never
    vi.mocked(firstDependencies.createFlowResult).mockResolvedValue(authenticatedResult)
    vi.mocked(replayDependencies.createFlowResult).mockResolvedValue(authenticatedResult)

    await completeOAuthAuthorization(options, firstDependencies)
    await completeOAuthAuthorization(options, replayDependencies)

    expect(firstDependencies.createFlowResult).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatedSessionId: sessionId,
        deviceId,
        refreshAuthenticatedSession: false,
      }),
    )
    expect(replayDependencies.createFlowResult).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatedSessionId: sessionId,
        deviceId,
        refreshAuthenticatedSession: true,
      }),
    )
  })

  it('issues an authenticated session only after durable completion resolves', async () => {
    const userId = randomUUID()
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const transaction = Promise.withResolvers<{
      kind: 'authenticated'
      userId: string
      deviceId: string
      sessionId: string
      newlyCompleted: boolean
    }>()
    const dependencies = completionDependencies({
      kind: 'authenticated',
      userId,
      deviceId,
      sessionId,
      newlyCompleted: true,
    })
    vi.mocked(dependencies.completeTransaction).mockReturnValue(transaction.promise)
    vi.mocked(dependencies.createFlowResult).mockResolvedValue({
      mfaRequired: false,
      user: { id: userId },
      deviceToken: {},
      sessionToken: {},
    } as never)

    const completion = completeOAuthAuthorization(completionOptions(), dependencies)
    await Promise.resolve()
    expect(dependencies.createFlowResult).not.toHaveBeenCalled()

    transaction.resolve({
      kind: 'authenticated',
      userId,
      deviceId,
      sessionId,
      newlyCompleted: true,
    })
    await completion

    expect(dependencies.createFlowResult).toHaveBeenCalledOnce()
  })

  it('replays the durable MFA challenge without refreshing its login attempt', async () => {
    const userId = randomUUID()
    const loginAttemptId = randomUUID()
    const dependencies = completionDependencies({
      kind: 'mfa_required',
      userId,
      loginAttemptId,
    })
    await expect(completeOAuthAuthorization(completionOptions(), dependencies)).resolves.toEqual({
      status: 'mfa_required',
      loginAttemptId,
    })
    await expect(completeOAuthAuthorization(completionOptions(), dependencies)).resolves.toEqual({
      status: 'mfa_required',
      loginAttemptId,
    })

    expect(dependencies.requireUser).not.toHaveBeenCalled()
    expect(dependencies.createFlowResult).not.toHaveBeenCalled()
  })

  it('fails closed when a durable authentication replay unexpectedly requires MFA', async () => {
    const dependencies = completionDependencies({
      kind: 'authenticated',
      userId: randomUUID(),
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      newlyCompleted: false,
    })
    vi.mocked(dependencies.createFlowResult).mockResolvedValue({
      mfaRequired: true,
      loginAttemptId: randomUUID(),
    } as never)

    await expect(completeOAuthAuthorization(completionOptions(), dependencies)).rejects.toThrow(
      'Stored OAuth authentication result unexpectedly requires MFA',
    )
  })

  it('runs connection effects exactly once for a newly completed connection', async () => {
    const userId = randomUUID()
    const dependencies = completionDependencies({
      kind: 'connected',
      userId,
      provider: 'github',
      newlyCompleted: true,
      account: {
        user_id: userId,
        provider_user_id: 'github-user',
        provider_user_email_address: null,
        provider_user_data: { name: 'GitHub Friend' },
      },
    })

    await expect(
      completeOAuthAuthorization(completionOptions(), dependencies),
    ).resolves.toMatchObject({
      status: 'connected',
      name: 'GitHub Friend',
    })

    expect(dependencies.runConnectionEffects).toHaveBeenCalledWith(userId)
    expect(dependencies.enqueueFriendSync).toHaveBeenCalledWith('github', 'github-user')
  })

  it('returns a durable connection when its immediate friend-sync enqueue fails', async () => {
    const userId = randomUUID()
    const dependencies = completionDependencies({
      kind: 'connected',
      userId,
      provider: 'github',
      newlyCompleted: true,
      account: {
        user_id: userId,
        provider_user_id: 'github-user',
        provider_user_email_address: null,
        provider_user_data: {},
      },
    })
    vi.mocked(dependencies.enqueueFriendSync).mockRejectedValue(
      Object.assign(new Error('Valkey unavailable'), {
        tags: { suppressLogging: true },
      }),
    )

    await expect(
      completeOAuthAuthorization(completionOptions(), dependencies),
    ).resolves.toMatchObject({
      status: 'connected',
      account: { provider_user_id: 'github-user' },
    })
    expect(dependencies.enqueueFriendSync).toHaveBeenCalledOnce()
  })

  it('returns a durable connection and continues friend sync when connection effects fail', async () => {
    const userId = randomUUID()
    const dependencies = completionDependencies({
      kind: 'connected',
      userId,
      provider: 'github',
      newlyCompleted: true,
      account: {
        user_id: userId,
        provider_user_id: 'github-user',
        provider_user_email_address: null,
        provider_user_data: {},
      },
    })
    vi.mocked(dependencies.runConnectionEffects).mockRejectedValue(
      Object.assign(new Error('Post-commit effect unavailable'), {
        tags: { suppressLogging: true },
      }),
    )

    await expect(
      completeOAuthAuthorization(completionOptions(), dependencies),
    ).resolves.toMatchObject({
      status: 'connected',
      account: { provider_user_id: 'github-user' },
    })
    expect(dependencies.enqueueFriendSync).toHaveBeenCalledWith('github', 'github-user')
  })
})

function completionOptions(
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

function completionDependencies(
  durableResult: Awaited<ReturnType<CompletionDependencies['completeTransaction']>>,
): CompletionDependencies {
  return {
    completeTransaction: vi.fn<CompletionDependencies['completeTransaction']>(
      async () => durableResult,
    ),
    createFlowResult: vi.fn<CompletionDependencies['createFlowResult']>(),
    enqueueFriendSync: vi.fn<CompletionDependencies['enqueueFriendSync']>(async () => undefined),
    requireUser: vi.fn<CompletionDependencies['requireUser']>(
      async () =>
        ({
          id: durableResult.kind === 'pending' ? '' : durableResult.userId,
        }) as never,
    ),
    runConnectionEffects: vi.fn<CompletionDependencies['runConnectionEffects']>(
      async () => undefined,
    ),
  } as unknown as CompletionDependencies
}
