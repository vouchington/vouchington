import { expect } from 'vitest'
import { HTML_SECURITY_HEADERS } from './constants.mts'
import type { TracedRequest } from './backend-trace-proxy.mts'

export function expectNoServerErrors(tracedRequests: TracedRequest[], label: string): void {
  const failures = tracedRequests.flatMap(request =>
    request.status >= 500
      ? [{ label, method: request.method, status: request.status, path: request.path }]
      : [],
  )
  expect(failures).toEqual([])
}

export function expectSecurityHeaders(response: Response, includeCsp: boolean): void {
  for (const [name, value] of Object.entries(HTML_SECURITY_HEADERS)) {
    expect(response.headers.get(name)).toBe(value)
  }

  expect(response.headers.get('strict-transport-security')).toBeNull()

  if (includeCsp) {
    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
    // Report-only header must not be present — enforcement is the single policy.
    expect(response.headers.get('content-security-policy-report-only')).toBeNull()
  } else {
    // Non-web routes (backend, sitemaps) must not emit either CSP header.
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect(response.headers.get('content-security-policy-report-only')).toBeNull()
  }
}
