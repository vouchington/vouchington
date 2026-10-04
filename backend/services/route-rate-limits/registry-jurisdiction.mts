import type { RouteRateLimitEntry } from './types.mts'

/** Territorial case reads and jurisdiction-policy mutations use explicit route limits. */
export const JURISDICTION_ROUTE_REGISTRY: Record<string, RouteRateLimitEntry> = {
  'GET:/api/v1/copyright-notices/:id/territorial-complaints': { category: 'read' },
  'GET:/api/v1/copyright-notices/:id/eu-dispute-settlements': { category: 'read' },
  'GET:/api/v1/copyright-notices/:id/eu-dispute-settlements/staff': { category: 'read' },
  'GET:/api/v1/copyright-jurisdiction-availability': { category: 'read' },
  'POST:/api/v1/copyright-jurisdiction-policies': { category: 'sensitive' },
  'POST:/api/v1/copyright-jurisdiction-policies/:id/withdrawals': { category: 'sensitive' },
}
