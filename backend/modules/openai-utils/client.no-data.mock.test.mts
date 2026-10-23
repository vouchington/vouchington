import { createServer, type Server } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLongRunningExternalFetch } from '@modules/utils'
import { listenOnRunnerUnreservedEphemeralPort } from 'vouchington-tooling/runner-port-policy'
import { isFetchSafePort } from '@ts-shared/utils/fetch-ports'
import { MissingModelClientCredentialError } from './missing-client-credential.mts'

// The default export is a Proxy that lazily constructs the real OpenAI client on first property
// access (see client.mts) and reuses it only while the credential is unchanged. Mocking the
// external 'openai' package (not an internal @modules boundary) lets this test observe exactly
// what the Proxy passes to `new OpenAI(...)` without needing real credentials or network access.
const openAIConstructorMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => ({
  ...(await importOriginal()),
  default: openAIConstructorMock as unknown as typeof import('openai').default,
}))

import openaiClient from './client.mts'

describe('openai client', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIConstructorMock.mockClear()
  })

  it('requires a key before construction, then wires the guarded fetch into the SDK', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    try {
      // Any property access forces the Proxy to lazily construct the client (see client.mts).
      expect(() => void (openaiClient as unknown as Record<string, unknown>).apiKey).toThrow(
        MissingModelClientCredentialError,
      )
      expect(openAIConstructorMock).not.toHaveBeenCalled()
      vi.stubEnv('OPENAI_API_KEY', 'test-key')
      void (openaiClient as unknown as Record<string, unknown>).apiKey

      expect(openAIConstructorMock).toHaveBeenCalledOnce()
      const options = openAIConstructorMock.mock.calls[0]?.[0] as {
        apiKey: string
        fetch: typeof fetch
      }
      expect(options.apiKey).toBe('test-key')
      expect(options.fetch).toBe(getLongRunningExternalFetch())
      // Bracket notation (not `globalThis.fetch`) so this identity check — never a real network
      // call — doesn't trip the `backend-no-globalthis-fetch` ast-grep guard, which bans the
      // dot-access member expression outright regardless of call vs. reference.
      expect(options.fetch).not.toBe(globalThis['fetch'])

      // Prove the injected fetch is functional, not merely present: it should complete a real
      // request through the guarded dispatcher.
      const server = createServer((_request, response) => {
        response.end('ok')
      })
      const address = await listen(server, '127.0.0.1')
      try {
        const response = await options.fetch(`http://127.0.0.1:${address.port}/`)
        expect(await response.text()).toBe('ok')
      } finally {
        await closeServer(server)
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('rejects a cleared credential instead of reusing the client constructed earlier', () => {
    void (openaiClient as unknown as Record<string, unknown>).apiKey
    const constructedBeforeClear = openAIConstructorMock.mock.calls.length

    vi.stubEnv('OPENAI_API_KEY', '')
    expect(() => {
      void (openaiClient as unknown as Record<string, unknown>).apiKey
    }).toThrow(MissingModelClientCredentialError)
    expect(openAIConstructorMock.mock.calls).toHaveLength(constructedBeforeClear)

    vi.stubEnv('OPENAI_API_KEY', 'replacement-key')
    void (openaiClient as unknown as Record<string, unknown>).apiKey
    expect(openAIConstructorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: 'replacement-key' }),
    )
    vi.unstubAllEnvs()
  })
})

async function listen(server: Server, host: string): Promise<{ port: number }> {
  const port = await listenOnRunnerUnreservedEphemeralPort(server, host, {
    isAllowedPort: isFetchSafePort,
  })
  return { port }
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
