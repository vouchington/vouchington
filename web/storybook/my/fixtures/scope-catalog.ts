import type { ScopeCatalogEntry } from '@/types/scopes'

function scope(
  name: string,
  audience: ScopeCatalogEntry['audience'],
  requires: string | null = null,
): ScopeCatalogEntry {
  const [resource, action] = name.split(':') as [string, ScopeCatalogEntry['action']]
  return { scope: name, resource, action, audience, requires, surfaces: ['api-key', 'oauth'] }
}

/** A small slice of the public scope catalogue, enough to show umbrella, paired, and admin rows. */
export const storybookScopeCatalog: readonly ScopeCatalogEntry[] = [
  scope('mcp.user:read', 'user'),
  scope('mcp.user:write', 'user', 'mcp.user:read'),
  scope('cards:read', 'user'),
  scope('cards:write', 'user', 'cards:read'),
  scope('posts:read', 'user'),
  scope('mcp.admin:read', 'admin'),
  scope('mcp.admin:write', 'admin', 'mcp.admin:read'),
]
