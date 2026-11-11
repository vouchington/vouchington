import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureQueryErrorContext,
  failQueryErrorContext,
  queryContextSuccess,
  rejectApplicationQueryError,
} from '@voucha/test-helpers/postgres-query-error-context'

describe('production PostgreSQL failure context', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['timeout', '57014', 'statement_timeout'],
    ['user_request', '57014', 'user_request'],
    ['serialization', '40001', 'serialization_failure'],
    ['deadlock', '40P01', 'deadlock_detected'],
    ['lock', '55P03', 'lock_not_available'],
    ['connections', '53300', 'too_many_connections'],
    ['other_cancellation', '57014', 'unknown_cancellation'],
  ] as const)(
    'reports safe context for server-raised %s and preserves its identity',
    async (kind, code, category) => {
      const report = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { original, observed } = await captureQueryErrorContext(kind)
      expect(observed).toBe(original)
      expect(observed).toMatchObject({ code })
      expect(report.mock.calls).toEqual([
        [`[pg-query-error-context] code=${code} category=${category}`],
      ])
      expect(report.mock.calls.flat().join('')).not.toContain('private')
    },
  )

  it.each(['read', 'write', 'query', 'transaction'] as const)(
    'reports a direct %s failure without a supplied executor',
    async operation => {
      const report = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(failQueryErrorContext(operation)).rejects.toMatchObject({ code: '57014' })
      expect(report.mock.calls).toEqual([
        ['[pg-query-error-context] code=57014 category=statement_timeout'],
      ])
    },
  )

  it.each(['read', 'write', 'query'] as const)(
    'retains a successful %s result without reporting',
    async operation => {
      const report = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect((await queryContextSuccess(operation)).rows).toEqual([{ value: 1 }])
      expect(report).not.toHaveBeenCalled()
    },
  )

  it('preserves the original native error even if synchronous reporting throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('Reporter unavailable')
    })
    const { original, observed } = await captureQueryErrorContext('timeout')
    expect(observed).toBe(original)
    expect(observed).toMatchObject({ code: '57014' })
  })

  it('does not report routine or application errors that happen to carry the same code', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { original, observed } = await captureQueryErrorContext('division')
    expect(observed).toBe(original)
    expect(observed).toMatchObject({ code: '22012' })
    const failure = Object.assign(new Error('private application detail'), { code: '57014' })
    await expect(rejectApplicationQueryError(failure)).rejects.toBe(failure)
    expect(report).not.toHaveBeenCalled()
  })
})
