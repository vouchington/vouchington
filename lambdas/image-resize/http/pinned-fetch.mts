import { safeFetch, UnsafeUrlError } from 'ssrf-guard/node'
import { HttpOperationError } from '../errors.mts'

type SafeFetchResponse = Awaited<ReturnType<typeof safeFetch>>

const BLOCKED_HOSTNAME_POLICY = {
  exact: ['localhost', 'metadata.google.internal'],
  suffixes: ['.localhost'],
}

export async function fetchWithPinnedDns(
  url: URL | string,
  signal: AbortSignal,
): Promise<SafeFetchResponse> {
  try {
    return await safeFetch(url, {
      blockedHostnames: BLOCKED_HOSTNAME_POLICY,
      signal,
      headers: { 'User-Agent': 'Voucha-Image-Resize/1.0' },
    })
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      const isClientInputError =
        error.reason === 'invalid URL' || error.reason.startsWith('scheme not allowed:')
      throw new HttpOperationError(
        `URL not allowed: ${error.reason}`,
        isClientInputError ? 400 : 403,
      )
    }
    throw error
  }
}
