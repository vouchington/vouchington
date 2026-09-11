import { afterEach, describe, expect, it, vi } from 'vitest'

import { logCacheDiagnostic } from './cache-diagnostics.mts'

const diagnostic = {
  requestId: 'request-id',
  routeTarget: 'web',
  methodClass: 'GET' as const,
  status: 200,
  cacheDisposition: 'DISPATCHED',
}

describe('logCacheDiagnostic', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs only bounded routing and cache fields when explicitly enabled', () => {
    const info = vi.spyOn(console, 'info').mockReturnValue(undefined)
    logCacheDiagnostic({ CACHE_DIAGNOSTICS: 'true' }, diagnostic)
    expect(info).toHaveBeenCalledWith('cloudflare_worker_cache', diagnostic)
  })

  it('is silent by default', () => {
    const info = vi.spyOn(console, 'info').mockReturnValue(undefined)
    logCacheDiagnostic({}, diagnostic)
    expect(info).not.toHaveBeenCalled()
  })
})
