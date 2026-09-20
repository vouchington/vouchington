import {
  DEFAULT_LOCALIZATION_BOUNDS,
  chromeSelectorId,
  routeSelectorId,
} from '@vouchington/localization'

export interface RouteAliasEntry {
  readonly pattern: string
  readonly selectorId: string
  readonly aliases: readonly string[]
}

export interface RouteAliasMap {
  chrome: string[]
  chromeSelector: string
  routes: RouteAliasEntry[]
}

export interface RouteAliasSource {
  readonly pattern: string
  readonly aliases: Iterable<string>
}

export function assertCatalogAliases(
  aliases: Iterable<string>,
  knownAliases: ReadonlySet<string>,
): void {
  const unknown = [...new Set(aliases)].filter(alias => !knownAliases.has(alias)).sort()
  if (unknown.length === 0) return
  throw new Error(`Quoted alias literals are not web catalog aliases: ${unknown.join(', ')}`)
}

/** Builds selector membership after route and global aliases have been discovered. */
export function assembleRouteAliasMap(
  knownAliases: ReadonlySet<string>,
  routeAliases: readonly RouteAliasSource[],
  globalAliases: Iterable<string>,
): RouteAliasMap {
  const matchedRouteAliases = routeAliases.map(route => ({
    pattern: route.pattern,
    aliases: new Set([...route.aliases].filter(alias => knownAliases.has(alias))),
  }))
  const chrome = new Set(matchedRouteAliases[0]?.aliases ?? [])
  for (const route of matchedRouteAliases.slice(1)) {
    for (const alias of chrome) if (!route.aliases.has(alias)) chrome.delete(alias)
  }
  for (const alias of globalAliases) if (knownAliases.has(alias)) chrome.add(alias)
  const chromeAliases = [...chrome].sort()
  const chromeSelector = chromeSelectorId(chromeAliases)
  const routes = matchedRouteAliases.map(route => ({
    pattern: route.pattern,
    aliases: [...route.aliases].filter(alias => !chrome.has(alias)).sort(),
    selectorId: routeSelectorId(
      route.pattern,
      [...route.aliases].filter(alias => !chrome.has(alias)).sort(),
    ),
  }))
  if (new Set(routes.map(route => route.selectorId)).size !== routes.length)
    throw new Error('Route selector hash collision')
  if (routes.length === 0) throw new Error('No web routes found')
  if (DEFAULT_LOCALIZATION_BOUNDS.maxSelectors < 2) throw new Error('Two web selectors required')
  return { chrome: chromeAliases, chromeSelector, routes }
}
