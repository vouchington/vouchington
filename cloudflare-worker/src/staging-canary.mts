import { timingSafeCredentialMatch } from './basic-auth.mts'
import { edgeErrorResponse } from './error-response.mts'
import { isProductionMode } from './production-mode.mts'
import {
  EDGE_CACHE_CANARY_PATH,
  EDGE_CACHE_CANARY_TAG,
  INTERNAL_CANARY_FAULT_HEADER,
  STAGING_CANARY_FAULT_HEADER,
  STAGING_CANARY_SECRET_HEADER,
  type StagingCanaryFault,
} from './staging-control-headers.mts'
import type { Env } from './types.mts'

export { EDGE_CACHE_CANARY_PATH, EDGE_CACHE_CANARY_TAG, type StagingCanaryFault }

const ALLOWED_FAULTS = new Set<StagingCanaryFault>(['sie', 'purge-reject', 'unexpected-throw'])

const faultMatchesRequest = (fault: StagingCanaryFault, request: Request): boolean => {
  const pathname = new URL(request.url).pathname
  if (fault === 'purge-reject')
    return pathname === '/infra/cache-purge' && request.method === 'POST'
  return pathname === EDGE_CACHE_CANARY_PATH && request.method === 'GET'
}

export type StagingCanaryControlResult =
  | { fault: StagingCanaryFault | null; request: Request }
  | { response: Response }

export const resolveStagingCanaryControl = (
  request: Request,
  env: Env,
): StagingCanaryControlResult => {
  const url = new URL(request.url)
  const secret = request.headers.get(STAGING_CANARY_SECRET_HEADER)
  const requestedFault = request.headers.get(STAGING_CANARY_FAULT_HEADER)
  const suppliedInternalFault = request.headers.has(INTERNAL_CANARY_FAULT_HEADER)
  const hasControl = secret !== null || requestedFault !== null
  const isCanaryPath = url.pathname === EDGE_CACHE_CANARY_PATH
  if (isProductionMode(env) && (hasControl || isCanaryPath)) {
    return { response: edgeErrorResponse(404, 'Not Found', 'NOT_FOUND') }
  }
  if (isCanaryPath && request.method !== 'GET') {
    return { response: edgeErrorResponse(404, 'Not Found', 'NOT_FOUND') }
  }
  if (!hasControl) {
    if (!suppliedInternalFault) return { fault: null, request }
    const headers = new Headers(request.headers)
    headers.delete(INTERNAL_CANARY_FAULT_HEADER)
    return { fault: null, request: new Request(request, { headers }) }
  }
  if (
    !env.CF_WORKER_SECRET ||
    !secret ||
    !timingSafeCredentialMatch(secret, new Set([env.CF_WORKER_SECRET]))
  ) {
    return { response: edgeErrorResponse(401, 'Unauthorized', 'UNAUTHORIZED') }
  }
  if (!requestedFault || !ALLOWED_FAULTS.has(requestedFault as StagingCanaryFault)) {
    return { response: edgeErrorResponse(400, 'Invalid canary fault', 'INVALID_INPUT') }
  }
  const fault = requestedFault as StagingCanaryFault
  if (!faultMatchesRequest(fault, request)) {
    return { response: edgeErrorResponse(400, 'Invalid canary fault target', 'INVALID_INPUT') }
  }
  const headers = new Headers(request.headers)
  headers.delete(STAGING_CANARY_SECRET_HEADER)
  headers.delete(STAGING_CANARY_FAULT_HEADER)
  headers.delete(INTERNAL_CANARY_FAULT_HEADER)
  headers.set(INTERNAL_CANARY_FAULT_HEADER, fault)
  return { fault, request: new Request(request, { headers }) }
}

export const createEdgeCacheCanaryResponse = (): Response =>
  new Response(
    JSON.stringify({ generation: crypto.randomUUID(), generatedAt: new Date().toISOString() }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  )
