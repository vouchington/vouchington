import { CACHE_PURGE_SECRET_HEADER } from '@ts-shared/cache/purge'

export const STAGING_AUTHORIZATION_HEADER = 'x-voucha-staging-authorization'
export const STAGING_CANARY_SECRET_HEADER = 'x-voucha-staging-canary-secret'
export const STAGING_CANARY_FAULT_HEADER = 'x-voucha-staging-canary-fault'
export const INTERNAL_CANARY_FAULT_HEADER = 'x-voucha-internal-canary-fault'
export const EDGE_CACHE_CANARY_PATH = '/infra/edge-cache-canary'
export const EDGE_CACHE_CANARY_TAG = 'edge-cache-canary'
export type StagingCanaryFault = 'sie' | 'purge-reject' | 'unexpected-throw'

export const stripStagingControlHeaders = (headers: Headers): void => {
  headers.delete(CACHE_PURGE_SECRET_HEADER)
  headers.delete(INTERNAL_CANARY_FAULT_HEADER)
  headers.delete(STAGING_AUTHORIZATION_HEADER)
  headers.delete(STAGING_CANARY_FAULT_HEADER)
  headers.delete(STAGING_CANARY_SECRET_HEADER)
}
