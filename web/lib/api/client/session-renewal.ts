'use client'

import { ApiError, parseErrorResponseBody } from '@vouchington/api-client'

let renewalInFlight: Promise<boolean> | undefined

/** One browser renewal at a time, including other tabs that share the httpOnly cookies. */
export function renewBrowserSession(): Promise<boolean> {
  renewalInFlight ??= renewWithBrowserLock()
    .catch(async err => {
      // Cleanup never renews credentials or depends on their fingerprint. If the origin is
      // unavailable, login still provides the recovery path when connectivity returns.
      await fetch('/api/v1/session', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10_000),
      }).catch(reportCleanupFailure)
      throw err
    })
    .finally(() => {
      renewalInFlight = undefined
    })
  return renewalInFlight
}

async function renewWithBrowserLock(): Promise<boolean> {
  if (!navigator.locks?.request) {
    // No timing-based lease fallback: an aborted HTTP request can still commit at the origin.
    // Browsers without coordination recover through login instead of risking token reuse.
    throw new ApiError('Sign in to continue', 401, { code: 'SESSION_RELOGIN_REQUIRED' })
  }
  return navigator.locks.request(
    'voucha-session-renewal',
    {
      mode: 'exclusive',
      signal: AbortSignal.timeout(30_000),
    },
    async () => {
      const response = await fetch('/api/v1/session', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok)
        throw new ApiError(
          'Session refresh failed',
          response.status,
          await parseErrorResponseBody(response),
        )
      const body = (await response.json()) as { session?: { uid?: unknown } }
      if (body.session?.uid === null) return false
      if (typeof body.session?.uid === 'string') return true
      throw new ApiError('Invalid session refresh response', 502, {
        code: 'SESSION_RELOGIN_REQUIRED',
      })
    },
  )
}

function reportCleanupFailure(error: unknown): void {
  console.error('Session cleanup failed', error)
}
