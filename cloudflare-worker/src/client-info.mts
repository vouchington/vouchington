import { CLIENT_INFO_HEADER_NAMES } from '@ts-shared/request-client-info'

export { CLIENT_INFO_HEADER_NAMES } from '@ts-shared/request-client-info'

export const REQUEST_KIND_HEADER = 'x-voucha-request-kind'

export type BackendRequestKind = 'bot' | 'cache-fill'

type ClientInfoOptions = {
  gitCommit?: string
  requestKind?: BackendRequestKind
}

export function applyBackendClientInfoHeaders(headers: Headers, options: ClientInfoOptions): void {
  headers.delete(REQUEST_KIND_HEADER)

  if (options.requestKind) {
    for (const name of CLIENT_INFO_HEADER_NAMES) headers.delete(name)
    headers.set(REQUEST_KIND_HEADER, options.requestKind)
    return
  }

  const browserShaped =
    headers.has('sec-fetch-site') ||
    headers.has('sec-fetch-mode') ||
    headers.has('sec-fetch-dest') ||
    headers.get('x-voucha-client') === 'web'
  if (!browserShaped) return

  headers.set('x-voucha-client', 'web')
  headers.set('x-voucha-platform', 'web')
  headers.set('x-voucha-app-version', options.gitCommit || 'development')
  headers.delete('x-voucha-sdk-version')
}
