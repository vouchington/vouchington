import { withHeaders } from './proxy.mts'

export const NO_STORE_HEADERS = {
  'cache-control': 'no-store, max-age=0, must-revalidate',
  'cdn-cache-control': 'no-store',
  'cloudflare-cdn-cache-control': 'no-store',
} as const

export function edgeErrorResponse(
  status: number,
  message: string,
  code: string,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ message, code }), {
    status,
    headers: { 'content-type': 'application/json', ...headers, ...NO_STORE_HEADERS },
  })
}

/** Returns the same Response for 2xx/3xx. For 4xx/5xx, wraps with no-store
 * cache headers while preserving multi-value Set-Cookie headers. */
export function withFailureNoStoreHeaders(response: Response): Response {
  if (response.status < 400) return response
  return withHeaders(response, NO_STORE_HEADERS)
}
