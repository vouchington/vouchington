import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import {
  assertCompletionCaller,
  getAuthorizationAccount,
  getAuthorizationForCompletion,
  getOAuthAccountName,
  getStoredCompletionResult,
  persistCompletionResult,
} from '../authorization-completion-persistence.mts'
import type {
  CompletionRow,
  OAuthAuthorizationCompletionOptions,
} from '../authorization-completion-types.mts'

describe('OAuth authorization completion persistence guards', () => {
  it('requires the initiating session, ownership, credential source, and token', () => {
    const { authorization, options } = validWebCompletion()

    expect(() =>
      assertCompletionCaller(authorization, { ...options, sessionId: randomUUID() }),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertCompletionCaller(
        { ...authorization, purpose: 'connect', initiating_user_id: randomUUID() },
        options,
      ),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertCompletionCaller(authorization, { ...options, completionTokenSource: 'body' }),
    ).toThrow(expect.objectContaining({ status: 401 }))
    expect(() =>
      assertCompletionCaller(authorization, { ...options, completionToken: 'wrong-token' }),
    ).toThrow(expect.objectContaining({ status: 401 }))
    expect(() =>
      assertCompletionCaller(authorization, { ...options, completionProofVerifier: 'unexpected' }),
    ).toThrow(expect.objectContaining({ status: 422 }))
  })

  it('accepts the exact native proof and rejects malformed proof material', () => {
    const completionToken = 'completion-token'
    const verifier = 'A'.repeat(43)
    const authorization = completionRow({
      callback_mode: 'native',
      completion_proof_challenge: createHash('sha256').update(verifier).digest('base64url'),
      completion_token_hash: completionTokenHash(completionToken),
    })
    const options = completionOptions({
      completionToken,
      completionTokenSource: 'body',
      completionProofVerifier: verifier,
    })

    expect(() => assertCompletionCaller(authorization, options)).not.toThrow()
    expect(() =>
      assertCompletionCaller(authorization, {
        ...options,
        completionProofVerifier: 'not-a-valid-verifier',
      }),
    ).toThrow(expect.objectContaining({ status: 401 }))
  })

  it('accepts an authenticated completion replay only from its newly authenticated user', () => {
    const userId = randomUUID()
    const resultDeviceId = uuidv7()
    const resultSessionId = uuidv7()
    const { authorization, options } = validWebCompletion()
    const completedAuthorization = completionRow({
      ...authorization,
      status: 'completed',
      result_kind: 'authenticated',
      result_user_id: userId,
      result_device_id: resultDeviceId,
      result_session_id: resultSessionId,
    })

    const replayOptions = {
      ...options,
      currentUserId: userId,
      deviceId: resultDeviceId,
      sessionId: resultSessionId,
    }

    expect(() => assertCompletionCaller(completedAuthorization, replayOptions)).not.toThrow()
    expect(() =>
      assertCompletionCaller(completedAuthorization, {
        ...replayOptions,
        currentUserId: randomUUID(),
      }),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertCompletionCaller(completedAuthorization, {
        ...replayOptions,
        currentUserId: undefined,
      }),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertCompletionCaller(
        { ...completedAuthorization, result_kind: 'mfa_required' },
        replayOptions,
      ),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertCompletionCaller(completedAuthorization, {
        ...replayOptions,
        deviceId: randomUUID(),
      }),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertCompletionCaller(completedAuthorization, {
        ...replayOptions,
        sessionId: randomUUID(),
      }),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertCompletionCaller(completedAuthorization, {
        ...replayOptions,
        completionToken: 'wrong-token',
      }),
    ).toThrow(expect.objectContaining({ status: 401 }))
  })

  it('fails closed for missing rows, accounts, and conflicting completion writes', async () => {
    await expect(
      getAuthorizationForCompletion(randomUUID(), queryReturning({ rows: [], rowCount: 0 })),
    ).rejects.toMatchObject({ status: 404 })

    await expect(
      getAuthorizationAccount(
        completionRow({ github_user_id: null }),
        queryReturning({ rows: [], rowCount: 0 }),
      ),
    ).rejects.toThrow('Completed OAuth exchange has no provider account')

    await expect(
      getAuthorizationAccount(
        completionRow({ github_user_id: 'missing-github-user' }),
        queryReturning({ rows: [], rowCount: 0 }),
      ),
    ).rejects.toThrow('Completed OAuth provider account is missing')

    await expect(
      persistCompletionResult(
        randomUUID(),
        {
          kind: 'authenticated',
          userId: randomUUID(),
          deviceId: randomUUID(),
          sessionId: randomUUID(),
        },
        queryReturning({ rows: [], rowCount: 0 }),
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('reconstructs every durable result and rejects incomplete durable state', () => {
    expect(() => getStoredCompletionResult(completionRow())).toThrow(
      'Completed OAuth authorization has no durable result',
    )
    expect(() =>
      getStoredCompletionResult(
        completionRow({
          result_kind: 'mfa_required',
          result_user_id: randomUUID(),
          login_attempt_id: null,
        }),
      ),
    ).toThrow('Completed OAuth MFA authorization has no login attempt')

    const userId = randomUUID()
    const loginAttemptId = randomUUID()
    expect(
      getStoredCompletionResult(
        completionRow({
          result_kind: 'mfa_required',
          result_user_id: userId,
          login_attempt_id: loginAttemptId,
        }),
      ),
    ).toEqual({ kind: 'mfa_required', userId, loginAttemptId })
    expect(
      getStoredCompletionResult(
        completionRow({ result_kind: 'connected', result_user_id: userId }),
      ),
    ).toEqual({ kind: 'connected', userId })
  })

  it('uses a provider display name only when it is a string', () => {
    expect(
      getOAuthAccountName({
        user_id: null,
        provider_user_id: 'provider-user',
        provider_user_email_address: null,
        provider_user_data: { name: 'Fixture Friend' },
      }),
    ).toBe('Fixture Friend')
    expect(
      getOAuthAccountName({
        user_id: null,
        provider_user_id: 'provider-user',
        provider_user_email_address: null,
        provider_user_data: { name: 42 },
      }),
    ).toBe('')
  })
})

function completionRow(overrides: Partial<CompletionRow> = {}): CompletionRow {
  return {
    id: '019c1234-1234-7123-8123-123456789abc',
    provider: 'github',
    purpose: 'authenticate',
    callback_mode: 'web',
    status: 'completion_ready',
    initiating_user_id: null,
    initiating_device_id: 'device-id',
    initiating_session_id: 'session-id',
    completion_proof_challenge: null,
    completion_token_hash: null,
    callback_error: null,
    facebook_user_id: null,
    x_user_id: null,
    github_user_id: 'github-user',
    result_kind: null,
    result_user_id: null,
    result_device_id: null,
    result_session_id: null,
    login_attempt_id: null,
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  }
}

function completionOptions(
  overrides: Partial<OAuthAuthorizationCompletionOptions> = {},
): OAuthAuthorizationCompletionOptions {
  return {
    flowId: '019c1234-1234-7123-8123-123456789abc',
    completionToken: 'completion-token',
    completionTokenSource: 'cookie',
    deviceId: 'device-id',
    sessionId: 'session-id',
    ...overrides,
  }
}

function validWebCompletion(): {
  authorization: CompletionRow
  options: OAuthAuthorizationCompletionOptions
} {
  const options = completionOptions()
  return {
    authorization: completionRow({
      completion_token_hash: completionTokenHash(options.completionToken),
    }),
    options,
  }
}

function completionTokenHash(token: string): string {
  return hashToken(
    'oauth-authorization-broker:completion:019c1234-1234-7123-8123-123456789abc',
    token,
  )
}

function queryReturning(result: { rows: unknown[]; rowCount: number }): TransactionQuery {
  return (async () => ({
    command: '',
    fields: [],
    oid: 0,
    ...result,
  })) as unknown as TransactionQuery
}
