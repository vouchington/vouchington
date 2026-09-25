import { CLIENT_INFO_HEADER_NAMES } from '@ts-shared/request-client-info'
import {
  hasBrowserFetchMetadata,
  isWebBrowserRequest,
  type WebBrowserRequest,
} from './web-browser-evidence.mts'

export { CLIENT_INFO_HEADER_NAMES } from '@ts-shared/request-client-info'

export const REQUEST_KIND_HEADER = 'x-voucha-request-kind'

export type BackendRequestKind = 'bot' | 'cache-fill'

type ClientInfoOptions = WebBrowserRequest & {
  gitCommit?: string
  requestKind?: BackendRequestKind
}

export function applyBackendClientInfoHeaders(headers: Headers, options: ClientInfoOptions): void {
  headers.delete(REQUEST_KIND_HEADER)

  if (options.requestKind) {
    deleteClientInfoHeaders(headers)
    headers.set(REQUEST_KIND_HEADER, options.requestKind)
    return
  }

  if (!hasBrowserFetchMetadata(headers)) {
    if (headers.get('x-voucha-client') === 'web') deleteClientInfoHeaders(headers)
    return
  }

  deleteClientInfoHeaders(headers)
  if (!isWebBrowserRequest(headers, options)) return

  headers.set('x-voucha-client', 'web')
  headers.set('x-voucha-platform', 'web')
  headers.set('x-voucha-app-version', options.gitCommit || 'development')
}

function deleteClientInfoHeaders(headers: Headers): void {
  for (const name of CLIENT_INFO_HEADER_NAMES) headers.delete(name)
}
