import type { RouteRateLimitEntry } from './types.mts'

/** MCP transport and content-creation routes share static write limits. */
export const CONTENT_ROUTE_REGISTRY: Record<string, RouteRateLimitEntry> = {
  'POST:/api/v1/mcp': { category: 'write', multiplier: 4 },
  'POST:/api/v1/admin/mcp': { category: 'write', multiplier: 4 },
  'POST:/api/v1/community-moderation/mcp': { category: 'write', multiplier: 4 },
  'POST:/api/v1/legal/mcp': { category: 'write', multiplier: 4 },
  'POST:/api/v1/posts': { category: 'write' },
  'POST:/api/v1/topics': { category: 'write' },
  'POST:/api/v1/rss-feeds': { category: 'write' },
  'POST:/api/v1/communities': { category: 'write' },
  // Outbound DNS and HTTPS, so this is not the default write category.
  'POST:/api/v1/topics/:idOrSlug/claims/:claimId/domain-verification': {
    category: 'sensitive',
  },
}
