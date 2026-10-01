import undici, { fetch as undiciFetch, MockAgent } from 'undici'
import { vi } from 'vitest'
import type { getExternalFetch } from '@modules/utils'

export { MockAgent }

/** Execute actual Undici HTTP parsing against an owned synthetic provider dispatcher. */
export function createMockAgentFetchForTest(agent: MockAgent): ReturnType<typeof getExternalFetch> {
  return async (input, init) =>
    (await undiciFetch(input, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: agent,
    })) as unknown as Response
}

/** Restore the external SDK method after a provider that uses Undici's default export runs. */
export async function withMockAgentDefaultFetchForTest<Result>(
  agent: MockAgent,
  operation: () => Promise<Result>,
): Promise<Result> {
  const originalFetch = undici.fetch
  const fetch = vi
    .spyOn(undici, 'fetch')
    .mockImplementation((input, init) => originalFetch(input, { ...init, dispatcher: agent }))
  try {
    return await operation()
  } finally {
    fetch.mockRestore()
  }
}
