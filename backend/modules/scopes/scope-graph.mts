import {
  createScopeCatalog,
  type ScopeCatalog,
  type ScopeDefinition as PublicScopeDefinition,
} from '@vouchington/utils/scopes'

import type { ApiScope, ScopeDefinition } from './scopes.mts'

/** Compile the product catalogue into the published scope graph. */
export function compileVouchaScopeCatalog(
  definitions: Record<ApiScope, ScopeDefinition>,
): ScopeCatalog {
  const entries = Object.entries(definitions) as [ApiScope, ScopeDefinition][]
  const publicDefinitions: Record<string, PublicScopeDefinition> = {}
  for (const [scope, definition] of entries) {
    const covers = compatibilityCovers(scope, definition, entries)
    publicDefinitions[scope] = {
      audience: definition.audience,
      surfaces: definition.surfaces,
      ...(definition.requires ? { requires: [definition.requires] } : {}),
      ...(covers ? { covers } : {}),
    }
  }
  return createScopeCatalog(publicDefinitions)
}

let cachedCatalog: { definitions: object; catalog: ScopeCatalog } | undefined

export function vouchaScopeGraph(definitions: Record<ApiScope, ScopeDefinition>): ScopeCatalog {
  if (cachedCatalog?.definitions === definitions) return cachedCatalog.catalog
  const catalog = compileVouchaScopeCatalog(definitions)
  cachedCatalog = { definitions, catalog }
  return catalog
}

function compatibilityCovers(
  scope: ApiScope,
  definition: ScopeDefinition,
  entries: [ApiScope, ScopeDefinition][],
): string[] | undefined {
  if (definition.audience !== 'user' && definition.audience !== 'admin') return undefined
  const umbrella = `mcp.${definition.audience}:${definition.action}`
  if (scope !== umbrella) return undefined
  const covers: string[] = []
  for (const [other, otherDefinition] of entries) {
    if (
      other !== scope &&
      otherDefinition.audience === definition.audience &&
      otherDefinition.action === definition.action &&
      otherDefinition.requiresExactGrant !== true
    ) {
      covers.push(other)
    }
  }
  covers.sort()
  return covers.length > 0 ? covers : undefined
}
