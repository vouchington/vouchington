import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import {
  getStoredCompletionResult,
  persistCompletionResult,
} from '../authorization-completion-persistence.mts'
import type { CompletionRow } from '../authorization-completion-types.mts'

describe('OAuth authorization durable completion results', () => {
  it('requires and reconstructs the durable authenticated session ID', () => {
    const userId = uuidv7()
    expect(() =>
      getStoredCompletionResult(
        completionRow({ result_kind: 'authenticated', result_user_id: userId }),
      ),
    ).toThrow('Completed OAuth authentication has no durable device or session')

    const deviceId = uuidv7()
    const sessionId = uuidv7()
    expect(
      getStoredCompletionResult(
        completionRow({
          result_kind: 'authenticated',
          result_user_id: userId,
          result_device_id: deviceId,
          result_session_id: sessionId,
        }),
      ),
    ).toEqual({ kind: 'authenticated', userId, deviceId, sessionId })
  })

  it('persists only the fields allowed by each durable result kind', async () => {
    const flowId = uuidv7()
    const userId = uuidv7()
    const deviceId = uuidv7()
    const sessionId = uuidv7()
    const loginAttemptId = uuidv7()
    const calls: unknown[][] = []
    const query = queryRecordingParameters(calls)

    await persistCompletionResult(
      flowId,
      { kind: 'authenticated', userId, deviceId, sessionId },
      query,
    )
    await persistCompletionResult(flowId, { kind: 'mfa_required', userId, loginAttemptId }, query)
    await persistCompletionResult(flowId, { kind: 'connected', userId }, query)

    expect(calls).toEqual([
      [flowId, 'authenticated', userId, deviceId, sessionId, null],
      [flowId, 'mfa_required', userId, null, null, loginAttemptId],
      [flowId, 'connected', userId, null, null, null],
    ])
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

function queryRecordingParameters(calls: unknown[][]): TransactionQuery {
  return (async (_sql: string, values: unknown[]) => {
    calls.push(values)
    return { command: '', fields: [], oid: 0, rows: [], rowCount: 1 }
  }) as unknown as TransactionQuery
}
