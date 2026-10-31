import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnthropicClient } from './anthropic-client.mts'

describe('getAnthropicClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reuses one client per credential and builds a new one when the credential changes', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ' key ')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'token')
    const first = getAnthropicClient()
    expect(getAnthropicClient()).toBe(first)
    expect(first.apiKey).toBe('key')
    expect(first.authToken).toBeNull()
    expect(first.maxRetries).toBe(0)

    vi.stubEnv('ANTHROPIC_API_KEY', '   ')
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
      expect.objectContaining({ code: 'client-unavailable', retryClass: 'permanent' }),
    )
  })
})
