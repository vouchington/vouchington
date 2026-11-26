import type { APIResponse } from '@playwright/test'
import type { Page } from './test.mts'
import { cookieOrigin } from './cookie-origin.mts'

/**
 * Same-origin API call through the page's request context. It uses the project baseURL and the
 * context cookies, so seeding needs no page load. The backend rejects cookie-bearing mutations
 * that carry no browser origin signals, so the headers a same-origin browser fetch sends are set.
 */
export function apiRequest(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: object,
): Promise<APIResponse> {
  return page.request.fetch(path, {
    method,
    data,
    headers: { Origin: cookieOrigin(), 'Sec-Fetch-Site': 'same-origin' },
  })
}
