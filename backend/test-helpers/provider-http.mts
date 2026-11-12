import undici, { fetch as undiciFetch, MockAgent, Agent } from 'undici'
import { vi } from 'vitest'
import type { getExternalFetch } from '@modules/utils'
import * as transport from '@vouchington/http-transport/fetch'

export { MockAgent }

/** Execute actual Undici HTTP parsing against an owned synthetic provider dispatcher. */
export function createMockAgentFetchForTest(agent: MockAgent): ReturnType<typeof getExternalFetch> {
  return async (input, init) =>
    (await undiciFetch(input, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: agent,
    })) as unknown as Response
}

/** Route provider HTTP while preserving explicitly allowed local emulator origins. */
export async function withMockAgentDefaultFetchForTest<Result>(
  agent: MockAgent,
  operation: () => Promise<Result>,
  passthroughOrigins: readonly string[] = [],
  binaryBodyOrigins: readonly string[] = [],
): Promise<Result> {
  const restore = installMockAgentDefaultFetchForTest(agent, passthroughOrigins, binaryBodyOrigins)
  try {
    return await operation()
  } finally {
    restore()
  }
}

/** Keep a provider HTTP fixture mounted for asynchronous worker callbacks. */
export function installMockAgentDefaultFetchForTest(
  agent: MockAgent,
  passthroughOrigins: readonly string[] = [],
  binaryBodyOrigins: readonly string[] = [],
): () => void {
  const originalDispatch = Agent.prototype.dispatch
  let routingMock = false
  const dispatcher = vi.spyOn(Agent.prototype, 'dispatch').mockImplementation(function (
    this: Agent,
    options,
    handler,
  ) {
    if (passthroughOrigins.includes(String(options.origin)))
      return originalDispatch.call(this, options, handler)
    if (routingMock) return originalDispatch.call(this, options, handler)
    const dispatch = (body: typeof options.body) => {
      routingMock = true
      try {
        return agent.dispatch({ ...options, body }, handler)
      } finally {
        routingMock = false
      }
    }
    const body = options.body
    if (body && typeof body === 'object' && Symbol.asyncIterator in body) {
      void (async () => {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of body) {
          const bytes = Buffer.from(chunk)
          size += bytes.length
          if (size > 8 * 1024 * 1024)
            throw new Error('Synthetic provider HTTP body exceeds fixture bound')
          chunks.push(bytes)
        }
        const bytes = Buffer.concat(chunks)
        dispatch(binaryBodyOrigins.includes(String(options.origin)) ? bytes : bytes.toString())
      })().catch((err: unknown) => {
        const failure =
          err instanceof Error ? err : new Error('Provider fixture request failed', { cause: err })
        handler.onResponseError?.(
          { aborted: true, paused: false, reason: failure, abort() {}, pause() {}, resume() {} },
          failure,
        )
      })
      return true
    }
    return dispatch(body)
  })
  const originalFetch = undici.fetch
  const fetch = vi.spyOn(undici, 'fetch').mockImplementation((input, init) => {
    const origin =
      typeof input === 'string'
        ? new URL(input).origin
        : 'url' in input
          ? new URL(input.url).origin
          : input.origin
    return originalFetch(
      input,
      passthroughOrigins.includes(origin) ? init : { ...init, dispatcher: agent },
    )
  })
  const originalTimedFetch = transport.fetchWithTimeout
  const originalSimpleFetch = transport.fetchWithTimeoutSimple
  const dispatchers = {
    getExternalRequestDispatcher: () => agent,
    getPinnedRequestDispatcher: () => agent,
  }
  const timed = vi
    .spyOn(transport, 'fetchWithTimeout')
    .mockImplementation(options => originalTimedFetch({ ...options, dispatchers }))
  const simple = vi
    .spyOn(transport, 'fetchWithTimeoutSimple')
    .mockImplementation((url, timeoutMs) => originalSimpleFetch(url, timeoutMs, agent))
  return () => {
    dispatcher.mockRestore()
    fetch.mockRestore()
    timed.mockRestore()
    simple.mockRestore()
  }
}
