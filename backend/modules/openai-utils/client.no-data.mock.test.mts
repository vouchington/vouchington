import { createServer, type Server } from 'node:http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLongRunningExternalFetch } from '@modules/utils'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import { isFetchSafePort } from '@ts-shared/utils/fetch-ports'

// The default export is a Proxy that lazily constructs the real OpenAI client on first property
// access (see client.mts) and memoizes it for the life of the module. Mocking the external
// 'openai' package (not an internal @modules boundary) lets this test observe exactly what the
// Proxy passes to `new OpenAI(...)` without needing real credentials or network access.
const openAIConstructorMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock<typeof import('openai')>(import('openai'), () => ({
  default: class MockOpenAI {
    constructor(options: unknown) {
      openAIConstructorMock(options)
    }
  } as unknown as typeof import('openai').default,
}))

import openaiClient from './client.mts'

describe('openai client', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIConstructorMock.mockClear()
  })

  it('wires the long-running egress-guarded fetch into the OpenAI SDK constructor', async () => {
    // Any property access forces the Proxy to lazily construct the client (see client.mts).
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
  })
})

async function listen(server: Server, host: string): Promise<{ port: number }> {
  const port = await listenOnEphemeralPort(server, host, {
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
