/**
 * Singleton instance of ServerRequest for Server Components
 */

import { ServerRequest } from '@vouchington/api-client'
import { fetchWithoutPrivateWorkerHeaders, resolveServerHeaders } from './request-headers'

export const serverApi = new ServerRequest({
  baseUrl: () =>
    process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2900',
  fetch: fetchWithoutPrivateWorkerHeaders,
  fetchInit: { cache: 'no-store' },
  resolveHeaders: resolveServerHeaders,
})
