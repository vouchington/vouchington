import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { classifyAnthropicError, ModelProviderError } from './errors.mts'

function apiError(status: number, message: string, headers: Record<string, string> = {}) {
  return Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'api_error', message } },
    message,
    new Headers(headers),
  )
}

describe('classifyAnthropicError', () => {
  it.each([
    [429, 'rate-limited'],
    [529, 'overloaded'],
    [500, 'server-error'],
    [503, 'server-error'],
  ] as const)('classifies HTTP %i as a transient %s failure', (status, code) => {
    const error = classifyAnthropicError(apiError(status, 'busy', { 'retry-after': '7' }))
    expect(error).toBeInstanceOf(ModelProviderError)
    expect(error).toMatchObject({
      code,
      retryClass: 'transient',
      retryAfterMs: 7000,
      ambiguousBilled: true,
    })
  })

  it('classifies other 4xx as permanent without a retry delay', () => {
    expect(classifyAnthropicError(apiError(401, 'bad key'))).toMatchObject({
      code: 'authentication',
      retryClass: 'permanent',
      retryAfterMs: undefined,
      ambiguousBilled: false,
    })
    expect(classifyAnthropicError(apiError(400, 'bad schema'))).toMatchObject({
      code: 'invalid-request',
      retryClass: 'permanent',
    })
  })

  it('gives "credit balance too low" its own permanent code', () => {
    expect(
      classifyAnthropicError(
        apiError(400, 'Your credit balance is too low to access the Anthropic API.'),
      ),
    ).toMatchObject({ code: 'credit-balance-too-low', retryClass: 'permanent', status: 400 })
  })

  it('treats a dropped connection as a transient, possibly billed failure', () => {
    expect(classifyAnthropicError(new Anthropic.APIConnectionTimeoutError())).toMatchObject({
      code: 'connection',
      retryClass: 'transient',
      ambiguousBilled: true,
    })
  })

  it('returns the caller own abort and unknown errors unchanged', () => {
    const abort = new Anthropic.APIUserAbortError()
    const unknown = new TypeError('boom')
    expect(classifyAnthropicError(abort)).toBe(abort)
    expect(classifyAnthropicError(unknown)).toBe(unknown)
  })
})
