import { describe, expect, it, vi } from 'vitest'
import { getLongRunningExternalFetch } from '@modules/utils'
import { MissingModelClientCredentialError } from '@modules/openai-utils/missing-client-credential'

const openAIConstructorMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => ({
  ...(await importOriginal()),
  default: openAIConstructorMock as unknown as typeof import('openai').default,
}))

import openRouterClient from './client.mts'

describe('openrouter client', () => {
  it('requires a key before construction, then configures the guarded SDK client', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    try {
      expect(() => void (openRouterClient as unknown as Record<string, unknown>).apiKey).toThrow(
        MissingModelClientCredentialError,
      )
      expect(openAIConstructorMock).not.toHaveBeenCalled()
      vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
      void (openRouterClient as unknown as Record<string, unknown>).apiKey

      expect(openAIConstructorMock).toHaveBeenCalledOnce()
      const options = openAIConstructorMock.mock.calls[0]?.[0] as {
        apiKey: string
        baseURL: string
        defaultHeaders: Record<string, string>
        fetch: typeof fetch
      }
      expect(options).toMatchObject({
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: { 'X-OpenRouter-Metadata': 'enabled' },
      })
      expect(options.fetch).toBe(getLongRunningExternalFetch())
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
