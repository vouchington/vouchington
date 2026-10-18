import { CLIENT_INFO_HEADER_NAMES } from '@ts-shared/request-client-info'
import { applyClientInfoHeaders as applyEdgeClientInfoHeaders } from '@vouchington/edge'

export { CLIENT_INFO_HEADER_NAMES } from '@ts-shared/request-client-info'

export const REQUEST_KIND_HEADER = 'x-voucha-request-kind'

export type BackendRequestKind = 'bot' | 'cache-fill'

type ClientInfoOptions = {
  method: string
  requestOrigin: string
  gitCommit?: string
  requestKind?: BackendRequestKind
}

export function applyBackendClientInfoHeaders(headers: Headers, options: ClientInfoOptions): void {
  applyEdgeClientInfoHeaders(
    headers,
    {
      requestKindHeader: REQUEST_KIND_HEADER,
      clientInfoHeaderNames: CLIENT_INFO_HEADER_NAMES,
      webClientHeader: { name: 'x-voucha-client', value: 'web' },
      webClientHeaders: {
        'x-voucha-client': 'web',
        'x-voucha-platform': 'web',
        'x-voucha-app-version': options.gitCommit || 'development',
      },
    },
    options,
  )
}
