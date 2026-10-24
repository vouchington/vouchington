import undici, { fetch as undiciFetch, MockAgent } from 'undici'
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

/** Route the app's timed fetches and Undici's default export through the supplied dispatcher. */
export async function withMockAgentDefaultFetchForTest<Result>(
  agent: MockAgent,
  operation: () => Promise<Result>,
): Promise<Result> {
  const originalFetch = undici.fetch
  const fetch = vi
    .spyOn(undici, 'fetch')
    .mockImplementation((input, init) => originalFetch(input, { ...init, dispatcher: agent }))
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
  try {
    return await operation()
  } finally {
    fetch.mockRestore()
    timed.mockRestore()
    simple.mockRestore()
  }
}
