import type { Env } from './types.mts'

interface CacheDiagnostic {
  requestId: string
  routeTarget: string
  methodClass: 'GET' | 'MUTATING'
  status: number
  cacheDisposition: string | null
}

export function logCacheDiagnostic(env: Env, diagnostic: CacheDiagnostic): void {
  if (env.CACHE_DIAGNOSTICS?.toLowerCase() !== 'true') return
  console.info('cloudflare_worker_cache', diagnostic)
}
