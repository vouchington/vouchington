import { edgeErrorResponse } from './error-response.mts'
import type { Env } from './types.mts'

export function getMaintenanceResponse(request: Request, env: Env): Response | null {
  if (env.MAINTENANCE_MODE?.toLowerCase() !== 'true') return null
  const pathname = new URL(request.url).pathname
  if (pathname === '/monitoring') return null

  const retryAfter = env.MAINTENANCE_RETRY_AFTER_SECONDS ?? '300'
  return edgeErrorResponse(503, 'Service temporarily unavailable', 'SERVICE_UNAVAILABLE', {
    'retry-after': retryAfter,
  })
}
