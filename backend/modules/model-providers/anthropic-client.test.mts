import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnthropicClient, resolveAnthropicCredentials } from './anthropic-client.mts'
import { ModelProviderError } from './errors.mts'

describe('resolveAnthropicCredentials', () => {
  it('prefers the API key over the federated token', () => {
    expect(
      resolveAnthropicCredentials({ ANTHROPIC_API_KEY: ' key ', ANTHROPIC_AUTH_TOKEN: 'token' }),
    ).toEqual({ apiKey: 'key', authToken: null })
  })

  it('falls back to the federated token when the key is unset or blank', () => {
    expect(resolveAnthropicCredentials({ ANTHROPIC_AUTH_TOKEN: 'token' })).toEqual({
      apiKey: null,
      authToken: 'token',
    })
    expect(
      resolveAnthropicCredentials({ ANTHROPIC_API_KEY: '  ', ANTHROPIC_AUTH_TOKEN: 'token' }),
    ).toEqual({ apiKey: null, authToken: 'token' })
  })

  it('is a permanent client-unavailable failure, not a crash, when neither is set', () => {
    expect(() => resolveAnthropicCredentials({})).toThrow(ModelProviderError)
    expect(() => resolveAnthropicCredentials({})).toThrow(
      expect.objectContaining({ code: 'client-unavailable', retryClass: 'permanent' }),
    )
  })
})

describe('getAnthropicClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reuses one client per credential and builds a new one when the credential changes', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'first-key')
    const first = getAnthropicClient()
    expect(getAnthropicClient()).toBe(first)
    expect(first.apiKey).toBe('first-key')
    expect(first.maxRetries).toBe(0)

    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'federated-token')
    const second = getAnthropicClient()
    expect(second).not.toBe(first)
    expect(second.authToken).toBe('federated-token')
    expect(second.apiKey).toBeNull()
  })

  it('throws the client-unavailable failure when no credential is set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
    expect(() => getAnthropicClient()).toThrow(
      expect.objectContaining({ code: 'client-unavailable' }),
    )
  })
})
