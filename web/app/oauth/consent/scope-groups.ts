import type { McpScopeAudience, ScopeCatalogResponse } from '@/types/scopes'

export interface ConsentScopeGroup {
  audience: McpScopeAudience | null
  normal: string[]
  sensitive: string[]
}

export function groupConsentScopes(
  requested: readonly string[],
  sensitive: readonly string[],
  catalog: ScopeCatalogResponse,
): ConsentScopeGroup[] {
  const audiences = new Map(catalog.scopes.map(entry => [entry.scope, entry.audience]))
  const groups = catalog.audiences.map(policy => ({
    audience: policy.audience,
    normal: [] as string[],
    sensitive: [] as string[],
  }))
  const groupsByAudience = new Map(groups.map(group => [group.audience, group]))
  const other: ConsentScopeGroup = { audience: null, normal: [], sensitive: [] }
  for (const scope of requested) {
    const audience = audiences.get(scope)
    const group = audience ? (groupsByAudience.get(audience as McpScopeAudience) ?? other) : other
    group[sensitive.includes(scope) ? 'sensitive' : 'normal'].push(scope)
  }
  return [...groups, other].filter(group => group.normal.length + group.sensitive.length > 0)
}
