import type { ScopeAudience, ScopeCatalogEntry, ScopeCredentialSurface } from '@/types/scopes'

/** The backend accepts exactly this scope set for an RSS key. */
export const RSS_KEY_SCOPES: readonly string[] = ['rss:read']

export interface ScopeResourceRow {
  resource: string
  /** `mcp.<audience>` resources grant every tool of their audience and render first. */
  umbrella: boolean
  read: ScopeCatalogEntry | null
  write: ScopeCatalogEntry | null
}

/** An MCP API key carries scopes of exactly one of these audiences. */
export type ApiKeyAudience = Extract<ScopeAudience, 'admin' | 'user'>

/**
 * OAuth tokens are bound to the user or admin MCP resource, so an app may mix only those
 * audiences; admin scopes are offered only to administrators.
 */
export function oauthScopeAudiences(isAdmin: boolean): ApiKeyAudience[] {
  return isAdmin ? ['user', 'admin'] : ['user']
}

export function scopeResourceRows(
  catalog: readonly ScopeCatalogEntry[],
  surface: ScopeCredentialSurface,
  audiences: readonly ScopeAudience[],
): ScopeResourceRow[] {
  const rows = new Map<string, ScopeResourceRow>()
  for (const entry of catalog) {
    if (!entry.surfaces.includes(surface) || !audiences.includes(entry.audience)) continue
    const row = rows.get(entry.resource) ?? {
      resource: entry.resource,
      umbrella: entry.resource === `mcp.${entry.audience}`,
      read: null,
      write: null,
    }
    row[entry.action] = entry
    rows.set(entry.resource, row)
  }
  return [...rows.values()].toSorted(
    (a, b) => Number(b.umbrella) - Number(a.umbrella) || a.resource.localeCompare(b.resource),
  )
}

/**
 * Checking a scope also selects every scope it requires; unchecking one drops every selected
 * scope that requires it, so the selection always satisfies the catalogue's prerequisites.
 */
export function toggleScope(
  catalog: readonly ScopeCatalogEntry[],
  selected: readonly string[],
  scope: string,
  checked: boolean,
): string[] {
  const next = new Set(selected)
  if (checked) {
    for (let current: string | null = scope; current; current = requiredScope(catalog, current)) {
      next.add(current)
    }
  } else {
    next.delete(scope)
    for (const entry of catalog) {
      if (next.has(entry.scope) && requiresTransitively(catalog, entry.scope, scope)) {
        next.delete(entry.scope)
      }
    }
  }
  const ordered: string[] = []
  for (const entry of catalog) {
    if (next.has(entry.scope)) ordered.push(entry.scope)
  }
  return ordered
}

function requiredScope(catalog: readonly ScopeCatalogEntry[], scope: string): string | null {
  return catalog.find(entry => entry.scope === scope)?.requires ?? null
}

function requiresTransitively(
  catalog: readonly ScopeCatalogEntry[],
  scope: string,
  prerequisite: string,
): boolean {
  for (let current = requiredScope(catalog, scope); current;) {
    if (current === prerequisite) return true
    current = requiredScope(catalog, current)
  }
  return false
}
