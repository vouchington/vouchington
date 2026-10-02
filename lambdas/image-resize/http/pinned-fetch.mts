import { safeFetch, UnsafeUrlError } from 'ssrf-guard/node'
import { firstPartyMediaBlockedHosts } from '@ts-shared/url-signing'
import { HttpOperationError } from '../errors.mts'

type SafeFetchResponse = Awaited<ReturnType<typeof safeFetch>>

function blockedHostnamePolicy() {
  const mediaHosts = firstPartyMediaBlockedHosts()
  return {
    exact: ['localhost', 'metadata.google.internal', ...mediaHosts.exact],
    suffixes: ['.localhost', ...mediaHosts.suffixes],
  }
}

export async function fetchWithPinnedDns(
  url: URL | string,
  signal: AbortSignal,
  options: { maxRedirects?: number } = {},
): Promise<SafeFetchResponse> {
  try {
    return await safeFetch(url, {
      blockedHostnames: blockedHostnamePolicy(),
      maxRedirects: options.maxRedirects,
      signal,
      headers: { 'User-Agent': 'Voucha-Image-Resize/1.0' },
    })
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      const isClientInputError =
        err.reason === 'invalid URL' || err.reason.startsWith('scheme not allowed:')
      throw new HttpOperationError(`URL not allowed: ${err.reason}`, isClientInputError ? 400 : 403)
    }
    throw err
  }
}
