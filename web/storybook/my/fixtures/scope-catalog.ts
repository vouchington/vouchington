import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/scopes'

function scope(
  name: string,
  audience: ScopeCatalogEntry['audience'],
  requires: string | null = null,
): ScopeCatalogEntry {
  const [resource, action] = name.split(':') as [string, ScopeCatalogEntry['action']]
  return {
    scope: name,
    resource,
    action,
    audience,
    description_key:
      resource === 'mcp.admin'
        ? 'mcp_admin_full_access'
        : resource === 'mcp.user'
          ? 'mcp_user_full_access'
          : null,
    requires,
    surfaces: audience === 'admin' || audience === 'legal' ? ['oauth'] : ['api-key', 'oauth'],
  }
}

/** A small slice of the public scope catalogue, enough to show umbrella, paired, and admin rows. */
export const storybookScopeCatalog: readonly ScopeCatalogEntry[] = [
  scope('mcp.user:read', 'user'),
  scope('mcp.user:write', 'user', 'mcp.user:read'),
  scope('cards:read', 'user'),
  scope('cards:write', 'user', 'cards:read'),
  scope('posts:read', 'user'),
  scope('community-moderation:read', 'community_moderation'),
  scope('topic-claims:read', 'brand'),
  scope('mcp.admin:read', 'admin'),
  scope('mcp.admin:write', 'admin', 'mcp.admin:read'),
  scope('copyright-notices:read', 'legal'),
]

export const storybookScopeCatalogResponse: ScopeCatalogResponse = {
  scopes: [...storybookScopeCatalog],
  audiences: [
    { audience: 'user', accepts_api_keys: true, requires_administrator: false },
    { audience: 'community_moderation', accepts_api_keys: true, requires_administrator: false },
    { audience: 'brand', accepts_api_keys: true, requires_administrator: false },
    { audience: 'admin', accepts_api_keys: false, requires_administrator: true },
    { audience: 'legal', accepts_api_keys: false, requires_administrator: true },
  ],
}
