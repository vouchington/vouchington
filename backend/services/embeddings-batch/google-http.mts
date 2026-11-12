import { getProviderFetch } from '@modules/api-egress-proxy'
import { accessTokenUntilAborted } from '@services/embeddings/vertex'

export class GoogleBatchApiError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`Google batch API request failed (${status})`)
    this.status = status
  }
}

/* no-mistakes: integration=google */
export async function googleRequest(
  url: string,
  init: RequestInit & { duplex?: 'half' } = {},
): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(120_000)
  const token = await accessTokenUntilAborted(signal)
  signal.throwIfAborted()
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  const response = await getProviderFetch('gemini_embeddings_enabled', 'long-running')(url, {
    ...init,
    signal,
    headers,
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new GoogleBatchApiError(response.status)
  }
  return response
}
